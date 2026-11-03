# Account admin

Stock CSS cannot show you every account on your server, and cannot delete
one. The image can, from the server's own terminal:

```sh
scripts/admin.sh
```

| You want to… | Read |
|---|---|
| try it once, safely, on a throwaway server | [Tutorial: your first clean-up](tutorial.md) |
| delete accounts on a real instance | [How-to: delete accounts on a VPS](how-to.md) |
| look up a key, a command or the route | [Reference](reference.md) |
| understand why it works this way | [Explanation](explanation.md) |

Decided in solid-kit ADR 012. Built in `account-admin/` (the component inside
CSS) and `admin/admin.js` (the terminal tool).
