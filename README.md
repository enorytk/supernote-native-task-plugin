# Supernote native task watcher

A Supernote plugin that checks whether PluginHost can read the native To-Do content provider and watches an explicitly selected task for completion. It works from a note toolbar button and uses the native task app as the source of truth.

## Implemented
- Provider metadata, permission diagnostics and actual column discovery.
- Optional preview of five task records, with bounded text and omitted blobs.
- Exact task lookup using a validated ID column and bound ID value.
- Configurable completion column/value: no assumed cloud database schema.
- Baseline comparison showing which task fields changed.
- Optional polling every 15 seconds while React Native reports the plugin active, plus refresh on return to active state. Supernote lifecycle behavior requires device verification.
- Single outstanding query and cooperative ten-second cancellation.

This is the first device-testable implementation of the spike. It does **not** automatically discover a note's linked tasks, persist watch settings, or draw strike-through strokes. Native provider access and task-to-note identifiers must be verified before implementing those behaviors. No insert, update, delete, network calls or ink writes occur in the plugin.

## Build
Use Node 18+ (CI uses 22), JDK 17+, Android SDK platform and build tools 35, and NDK 27.1.12297006. Set ANDROID_HOME and JAVA_HOME. Then:

```bash
npm ci
npm run check
npm test -- --runInBand
npm run plugin
```

Output: `build/outputs/TaskProviderProbe.snplg`. The packager stops when native compilation fails and removes stale output before building. The plugin must include `app.npk`, reactPackages `com.taskprobe.TaskProbePackage`, and nativeCodePackage `/app.npk`. `.github/workflows/build.yml` provisions an Android build environment and uploads the plugin artifact when pushed to GitHub. The workflow has not yet run.

## Test on your Supernote
1. Install the built plugin through Supernote's plugin interface. Open a note and tap **Task provider probe**.
2. Choose **Inspect provider and schema**. Record `callerPackage`, `queryOutcome`, columns and permissions. Schema mode does not display task values.
3. Create a disposable task through native lasso-to-task. Choose **Read 5 task samples** to inspect returned ID and status columns. Preview rows are unordered and capped; if the test task is absent, use the ID of a disposable returned task or enter a known ID.
4. Enter the task ID column/value, completion column and expected completed value. Values are compared as exact strings; do not infer a completion encoding until confirmed by before/after records.
5. **Capture baseline**, check the task in native To-Do, and **Check selected task now**. The report shows the current row and changed columns. Use these to establish the actual completion encoding and inspect any note/page/link identifiers.
6. Optionally enable watching. It pauses when AppState is not active. Configuration and baseline are held only for the current mounted screen session; reconfigure if the host remounts it.

Reports can contain private task data. Share only disposable task reports.

## Interpret results
- `cursor_obtained` establishes provider readability for that caller on that firmware; `found` establishes the exact task query works.
- `permission_denied` includes the actual exception. Check caller UID/package and provider permissions. A companion APK may also be denied if signature permissions apply.
- `metadataVisible=false` alone does not prove denied access: Android package visibility can hide metadata, and the code still attempts the query. The scaffold queries declaration does not grant permissions to installed PluginHost.
- `not_found`, `ambiguous`, errors, mismatched task IDs and missing completion values produce unknown status, never completion.
- Cancellation is cooperative; a provider can ignore it. Close the plugin if a query hangs.

## Validation
TypeScript and seven state/comparison tests pass. Metro bundling passes. Native compilation is not verified: this environment lacks an Android SDK and Gradle's distribution download fails with Network is unreachable. No Supernote is attached, so provider permissions, schema, completion changes and host lifecycle remain unverified.

## Next step toward note strike-through
Verify stable task and note/page identifiers in the native rows, correlate them with SDK note elements, and test stroke identity/geometry across note reopen. Then add note-open polling and an idempotent ink update. The SDK inspected exposes no official native task status API or completion event.

## Sources and attribution
Scaffold: official `@supernote-plugin/sn-plugin-template` 1.0.12 (MIT, LICENSE included). SDK pinned to `sn-plugin-lib` 0.1.65.

- https://www.npmjs.com/package/@supernote-plugin/sn-plugin-template
- https://www.npmjs.com/package/sn-plugin-lib
- https://developer.android.com/guide/topics/providers/content-provider-basics

`content://com.ratta.supernote.task.provider/tasks_table` is a community-reported, firmware-dependent URI, not an official SDK contract.
