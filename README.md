# Native Task Sync for Supernote

Check a linked task in Supernote's native To-Do app, then return to its handwritten note page: this plugin reads completion and adds a strike-through across the linked handwriting. It preserves the original ink and persists task links on-device.

## Setup
1. Create a task with Supernote's normal native lasso-to-task action.
2. Lasso the same handwriting and choose **Link native task** from the lasso menu.
3. Load native tasks. Configure the task ID column, completion column and completed value for your firmware. The plugin does not guess database encodings: inspect a disposable task before/after completion to establish these once.
4. Select the matching native task and choose **Save link and enable automatic strike-through**. Grant FILE:READ and FILE:WRITE when requested.
5. Check the task in native To-Do. Return to the source note page; the plugin checks every five seconds while its JavaScript runtime is running, and on plugin lifecycle events. **Native Task Sync → Check this note now** runs the same update immediately.

The one-time linking step is required because the SDK inspected exposes neither an official native-task source-ink mapping nor a task-completion event. This version does not automatically discover tasks previously created from notes. It also does not create native tasks: use the native task app for creation and completion.

## What is implemented
- Native provider metadata/schema discovery, bounded preview of 200 task records and exact task lookup with bound parameters.
- Persistent links between native task IDs and lasso-selected handwriting, using element userData tags rather than transient SDK UUIDs.
- Automatic completion checks of the visible note page. Tagged handwriting is located again on each read, so moved ink is used rather than an old rectangle.
- One tagged strike-through per linked task/page. Tags are read back to verify idempotence; if a firmware drops them, the link is paused to prevent repeated insertion.
- No edits on unknown task state, denied provider access, missing anchors, unsupported coordinates, multiple layers or detected note/page switches.
- Original handwriting is preserved. Unchecking a task does not erase a previous mark. Use note undo or the eraser to remove it. Stop tracking removes the binding, not existing ink or its metadata tags.

Settings are stored in PluginHost's private preferences under a plugin-specific name. Task values are not sent to any server. The native task provider is queried read-only; note metadata and strike-through geometry are written through the SDK.

## Install
Use firmware with Supernote plugin support. Download the **TaskProviderProbe** artifact from a successful GitHub Actions run, unzip it, and copy `TaskProviderProbe.snplg` to `MyStyle` on your device. Install through Settings → Apps → Plugins → Choose Installation Package. Open a note and choose Native Task Sync. The internal module/build name remains TaskProviderProbe for compatibility with the original project.

## Build
Node 18+ (CI: 22), JDK 17+, Android SDK platform/build tools 35, NDK 27.1.12297006. Set ANDROID_HOME and JAVA_HOME.

```bash
npm ci
npm run check
npm test -- --runInBand
npm run plugin
```

Output: `build/outputs/TaskProviderProbe.snplg`, containing native app.npk. The packager stops on native compilation failure and removes stale output first. GitHub Actions builds and uploads the package. The workflow uses platform-tools instead of the removed Android `tools` package.

## Verification and limits
The completion-to-ink path is implemented, with tests covering successful completion, idempotence across engine recreation, denied/missing/ambiguous tasks, note switches, erased/moved handwriting, disabled bindings and metadata preservation. These tests use an SDK adapter; they are not a hardware test.

No Supernote is attached. Provider export permissions, actual column encodings, persistence of element userData, geometry rendering and host lifecycle behavior need device verification. If PluginHost cannot read the provider, this implementation cannot observe native completion; it reports the failure and does not alter ink. Native compilation status should be checked in Actions before installation.

Only the currently visible page is processed; the plugin does not navigate or edit closed notes. If the host stops the runtime, reopen Native Task Sync. A strike-through is one horizontal line through the selection's bounding box; use one line of handwriting per task. Copies retaining the same anchor metadata represent the same task. Automatic task-source discovery and reverse sync from handwritten checks are not implemented.

## Device acceptance test
Use a disposable note and task. Link its ink, complete it in native To-Do, return to the note, and verify exactly one correctly placed line. Reopen the note and restart the plugin: no second line should appear. Move linked ink before completing another disposable task and verify the line follows it. Deny provider/note access and verify no ink change. Task previews may contain private content; share only disposable reports.

## Sources and attribution
Scaffold: official @supernote-plugin/sn-plugin-template 1.0.12 (MIT; LICENSE included). SDK: sn-plugin-lib 0.1.65. The provider URI is community-reported and firmware-dependent, not an official SDK contract.

- https://www.npmjs.com/package/@supernote-plugin/sn-plugin-template
- https://www.npmjs.com/package/sn-plugin-lib
- https://developer.android.com/guide/topics/providers/content-provider-basics
