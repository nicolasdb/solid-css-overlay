#!/bin/sh
# The image's entrypoint: describe this instance (start/describe.js), write its
# email sender (start/email.js), write the account admin route and its token
# (start/admins.js), put the welcome page at the root
# (start/welcome.js), then run the stock server exactly as the stock
# image does (["node","bin/server.js"]), with the same arguments.
set -e
cd /community-server
node /opt/overlay/describe.js
node /opt/overlay/email.js
node /opt/overlay/admins.js
node /opt/overlay/welcome.js
exec node bin/server.js "$@"
