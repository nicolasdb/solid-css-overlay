"use strict";
// solid-css-overlay: CSS 7.3.0's dist/storage/LockingResourceStore.js with
// exactly the change of CommunitySolidServer PR #2298 (issue #2297), compiled
// by hand from its TypeScript. Nothing else differs from stock. Carried until a
// CSS release has the fix (solid-kit ADR 014, css-patches/stock.sha256).
//
// What went wrong: stock wrapped the stream with Object.create(source, {read}).
// Node reads and emits on the original stream, so a `for await` over the
// wrapper (JsonResourceStorage, the hourly expired-entry cleanup) got no event,
// the read lock expired after 6 s, destroy() hit "callback is not a function"
// outside any handler, and the server stopped (Maps of Making and Syntonie,
// every hour or so, November 2026).
Object.defineProperty(exports, "__esModule", { value: true });
exports.LockingResourceStore = void 0;
const LogUtil_1 = require("../logging/LogUtil");
const GuardedStream_1 = require("../util/GuardedStream");
const StreamUtil_1 = require("../util/StreamUtil");
/**
 * Store that for every call acquires a lock before executing it on the requested resource,
 * and releases it afterwards.
 * In case the request returns a Representation the lock will only be released when the data stream is finished.
 * Similarly, for write operations the lock will be maintained as long as the incoming data stream is being read.
 *
 * For auxiliary resources the lock will be applied to the subject resource.
 * The actual operation is still executed on the auxiliary resource.
 */
class LockingResourceStore {
    logger = (0, LogUtil_1.getLoggerFor)(this);
    source;
    locks;
    auxiliaryStrategy;
    constructor(source, locks, auxiliaryStrategy) {
        this.source = source;
        this.locks = locks;
        this.auxiliaryStrategy = auxiliaryStrategy;
    }
    async hasResource(identifier) {
        return this.locks.withReadLock(this.getLockIdentifier(identifier), async () => this.source.hasResource(identifier));
    }
    async getRepresentation(identifier, preferences, conditions) {
        return this.lockedRepresentationRun(this.getLockIdentifier(identifier), async () => this.source.getRepresentation(identifier, preferences, conditions));
    }
    async addResource(container, representation, conditions) {
        return this.lockedWriteRepresentationRun(this.getLockIdentifier(container), representation, async (expiringRepresentation) => this.source.addResource(container, expiringRepresentation, conditions));
    }
    async setRepresentation(identifier, representation, conditions) {
        return this.lockedWriteRepresentationRun(this.getLockIdentifier(identifier), representation, async (expiringRepresentation) => this.source.setRepresentation(identifier, expiringRepresentation, conditions));
    }
    async deleteResource(identifier, conditions) {
        return this.locks.withWriteLock(this.getLockIdentifier(identifier), async () => this.source.deleteResource(identifier, conditions));
    }
    async modifyResource(identifier, patch, conditions) {
        return this.lockedWriteRepresentationRun(this.getLockIdentifier(identifier), patch, async (expiringRepresentation) => this.source.modifyResource(identifier, expiringRepresentation, conditions));
    }
    /**
     * Acquires the correct identifier to lock this resource.
     * For auxiliary resources this means the subject identifier.
     */
    getLockIdentifier(identifier) {
        return this.auxiliaryStrategy.isAuxiliaryIdentifier(identifier) ?
            this.auxiliaryStrategy.getSubjectIdentifier(identifier) :
            identifier;
    }
    /**
     * Acquires a lock that is only released when all data of the resulting representation data has been read,
     * an error occurs, or the timeout has been triggered.
     * The resulting data stream will be adapted to reset the timer every time data is read.
     *
     * In case the data of the resulting stream is not needed it should be closed to prevent a timeout error.
     *
     * @param identifier - Identifier that should be locked.
     * @param whileLocked - Function to be executed while the resource is locked.
     */
    async lockedRepresentationRun(identifier, whileLocked) {
        // Create a new Promise that resolves to the resulting Representation
        // while only unlocking when the data has been read (or there's a timeout).
        // Note that we can't just return the result of `withReadLock` since that promise only
        // resolves when the stream is finished, while we want `lockedRepresentationRun` to resolve
        // once we have the Representation.
        // See https://github.com/CommunitySolidServer/CommunitySolidServer/pull/536#discussion_r562467957
        return new Promise((resolve, reject) => {
            let representation;
            // Make the resource time out to ensure that the lock is always released eventually.
            this.locks.withReadLock(identifier, async (maintainLock) => {
                representation = await whileLocked();
                // eslint-disable-next-line @typescript-eslint/unbound-method
                const { read } = representation.data;
                resolve(this.createExpiringRepresentation(representation, maintainLock));
                try {
                    // Release the lock when an error occurs or the data finished streaming
                    await this.waitForStreamToEnd(representation.data);
                }
                finally {
                    representation.data.read = read;
                }
            }).catch((error) => {
                // Destroy the source stream in case the lock times out
                representation?.data.destroy(error);
                // Let this function return an error in case something went wrong getting the data
                // or in case the timeout happens before `func` returned
                reject(error);
            });
        });
    }
    /**
     * Acquires a write lock that is held until the operation completes.
     * The input representation is adapted to reset the timer every time data is read.
     *
     * @param identifier - Identifier that should be locked.
     * @param inputRepresentation - Representation to pass to the write operation.
     * @param whileLocked - Function to be executed while the resource is locked.
     */
    async lockedWriteRepresentationRun(identifier, inputRepresentation, whileLocked) {
        let operationActive = false;
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const { read } = inputRepresentation.data;
        return this.locks.withWriteLock(identifier, async (maintainLock) => {
            operationActive = true;
            try {
                const expiringRepresentation = this.createExpiringRepresentation(inputRepresentation, maintainLock);
                return await whileLocked(expiringRepresentation);
            }
            finally {
                operationActive = false;
            }
        }).catch((error) => {
            // Destroy the source stream when an acquired lock expires while the operation is still active.
            // This prevents a source store from continuing a write without the protection of the lock.
            if (operationActive) {
                inputRepresentation.data.destroy(error);
            }
            throw error;
        }).finally(() => {
            inputRepresentation.data.read = read;
        });
    }
    /**
     * Wraps a representation to make it reset the timeout timer every time data is read.
     * The `read` function of the data stream itself is replaced to do this,
     * the callers restore the original function once the lock is released.
     *
     * @param representation - The representation to wrap
     * @param maintainLock - Function to call to reset the timer.
     */
    createExpiringRepresentation(representation, maintainLock) {
        const data = representation.data;
        // A wrapper object around the stream can not be used here,
        // as Node.js internally calls `read` and emits events on the original stream object.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const { read } = data;
        data.read = (size) => {
            maintainLock();
            return read.call(data, size);
        };
        // Reuse metadata to avoid duplicating potentially large container listings.
        return {
            ...representation,
            data: (0, GuardedStream_1.guardStream)(data),
            // BasicRepresentation defines isEmpty on its prototype, so it is not copied by the spread.
            isEmpty: representation.isEmpty,
        };
    }
    /**
     * Returns a promise that resolve when the source stream is finished,
     * either by ending or emitting an error.
     * In the case of an error the stream will be destroyed if it hasn't been already.
     *
     * @param source - The input stream.
     */
    async waitForStreamToEnd(source) {
        try {
            await (0, StreamUtil_1.endOfStream)(source);
        }
        catch {
            // Destroy the stream in case of errors
            if (!source.destroyed) {
                source.destroy();
            }
        }
    }
}
exports.LockingResourceStore = LockingResourceStore;
//# sourceMappingURL=LockingResourceStore.js.map