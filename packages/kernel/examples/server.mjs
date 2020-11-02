// A complete kernel-backed web app on ONE port: http serves the console UI, and the
// SAME server is the WebSurface ws host. Drives a real `claude` turn by default.
// This is "a swarmdeck-like project, built on @swarmdeck/kernel" — proving the kernel
// is a usable core, not just a library.
//
//   node packages/kernel/examples/server.mjs            # real claude on :3941
//   CONSOLE_REAL=0 PORT=3942 node .../server.mjs         # hermetic echo driver
