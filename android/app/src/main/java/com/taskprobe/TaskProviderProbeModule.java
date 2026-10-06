package com.taskprobe;

import android.content.pm.PackageManager;
import android.content.pm.ProviderInfo;
import android.content.pm.PathPermission;
import android.database.Cursor;
import android.net.Uri;
import android.os.CancellationSignal;
import android.os.Process;
import com.facebook.react.bridge.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

public final class TaskProviderProbeModule extends ReactContextBaseJavaModule {
  private static final String AUTHORITY = "com.ratta.supernote.task.provider";
  private static final Uri URI = Uri.parse("content://" + AUTHORITY + "/tasks_table");
  private final AtomicBoolean running = new AtomicBoolean(false);
  private final ExecutorService worker = Executors.newSingleThreadExecutor();
  private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor();

  public TaskProviderProbeModule(ReactApplicationContext context) { super(context); }
  @Override public String getName() { return "TaskProviderProbe"; }

  // No retries or URI guessing. Cancellation is cooperative: a broken provider
  // can ignore it, so do not run repeatedly if a query hangs.
  @ReactMethod public void inspect(boolean includeSamples, Promise promise) {
    if (!running.compareAndSet(false, true)) {
      promise.reject("BUSY", "A provider query is still running"); return;
    }
    try { worker.execute(() -> {
      WritableMap out = Arguments.createMap();
      CancellationSignal cancel = new CancellationSignal();
      ScheduledFuture<?> timeout = null;
      try {
        timeout = timer.schedule(cancel::cancel, 10, TimeUnit.SECONDS);
        ReactApplicationContext ctx = getReactApplicationContext();
        out.putString("callerPackage", ctx.getPackageName());
        out.putInt("callerUid", Process.myUid());
        out.putString("uri", URI.toString());
        try {
        ProviderInfo info = ctx.getPackageManager().resolveContentProvider(
            AUTHORITY, PackageManager.GET_URI_PERMISSION_PATTERNS);
        out.putBoolean("metadataVisible", info != null);
        // Null metadata can be caused by package visibility. Still try the
        // query: null metadata alone is NOT proof of denied provider access.
        if (info != null) {
          WritableMap provider = Arguments.createMap();
          provider.putString("package", info.packageName);
          provider.putString("class", info.name);
          provider.putBoolean("exported", info.exported);
          provider.putBoolean("enabled", info.enabled);
          provider.putBoolean("grantUriPermissions", info.grantUriPermissions);
          provider.putString("readPermission", info.readPermission);
          provider.putInt("providerUid", info.applicationInfo.uid);
          if (info.readPermission != null) {
            provider.putBoolean("callerHasReadPermission",
                ctx.checkPermission(info.readPermission, Process.myPid(), Process.myUid())
                  == PackageManager.PERMISSION_GRANTED);
          }
          WritableArray paths = Arguments.createArray();
          if (info.pathPermissions != null) for (PathPermission p : info.pathPermissions) {
            WritableMap path = Arguments.createMap();
            path.putString("path", p.getPath());
            path.putInt("patternType", p.getType());
            path.putString("readPermission", p.getReadPermission());
            paths.pushMap(path);
          }
          provider.putArray("pathPermissions", paths);
          out.putMap("provider", provider);
        }
        } catch (RuntimeException metadataError) {
          out.putString("metadataError", metadataError.toString());
        }
        // Null projection discovers the actual schema rather than guessing
        // cloud DB column names. No values are returned in schema-only mode.
        try (Cursor cursor = ctx.getContentResolver().query(
            URI, null, null, null, null, cancel)) {
          if (cursor == null) {
            out.putString("queryOutcome", "null_cursor");
          } else {
            String[] names = cursor.getColumnNames();
            WritableArray columns = Arguments.createArray();
            for (String name : names) columns.pushString(name);
            out.putArray("columns", columns);
            out.putString("queryOutcome", "cursor_obtained");
            // Exercise one row to detect lazy cursor/security failures even
            // in schema-only mode. Do not expose values unless opted in.
            boolean hasFirst = cursor.moveToFirst();
            out.putBoolean("hasRows", hasFirst);
            if (includeSamples) {
              WritableArray rows = Arguments.createArray();
              int returned = 0;
              if (hasFirst) do {
                WritableMap row = Arguments.createMap();
                for (int i = 0; i < names.length; i++) {
                  if (cursor.isNull(i)) { row.putNull(names[i]); continue; }
                  if (cursor.getType(i) == Cursor.FIELD_TYPE_BLOB) {
                    row.putString(names[i], "[blob omitted]"); continue;
                  }
                  String value = cursor.getString(i);
                  row.putString(names[i], value.length() > 2048
                      ? value.substring(0, 2048) + "[truncated]" : value);
                }
                rows.pushMap(row);
                returned++;
              } while (returned < 200 && cursor.moveToNext());
              out.putArray("samples", rows);
              out.putInt("sampleRowsReturned", returned);
              out.putBoolean("samplesCapped", returned == 200);
            }
          }
        }
      } catch (SecurityException e) {
        out.putString("queryOutcome", "permission_denied");
        out.putString("errorClass", e.getClass().getName());
        out.putString("error", e.getMessage());
      } catch (Exception e) {
        out.putString("queryOutcome", "error");
        out.putString("errorClass", e.getClass().getName());
        out.putString("error", e.getMessage());
      } finally {
        if (timeout != null) timeout.cancel(false);
        running.set(false);
      }
      promise.resolve(out);
    }); } catch (RejectedExecutionException e) {
      running.set(false); promise.reject("CLOSED", "The probe has been closed", e);
    }
  }
  // Explicit task lookup: parameters are bound, and column identifiers are
  // restricted to simple names. Multiple matches never count as completion.
  @ReactMethod public void readTask(String idColumn, String idValue, Promise promise) {
    if (!idColumn.matches("[A-Za-z_][A-Za-z0-9_]*") || idValue.isEmpty()) {
      promise.reject("INVALID_ID", "Provide a simple ID column and a nonempty task ID"); return;
    }
    if (!running.compareAndSet(false, true)) {
      promise.reject("BUSY", "A provider query is still running"); return;
    }
    try { worker.execute(() -> {
      WritableMap out = Arguments.createMap();
      CancellationSignal cancel = new CancellationSignal();
      ScheduledFuture<?> timeout = null;
      try {
        timeout = timer.schedule(cancel::cancel, 10, TimeUnit.SECONDS);
        try (Cursor cursor = getReactApplicationContext().getContentResolver().query(
            URI, null, "\"" + idColumn + "\" = ?", new String[]{idValue}, null, cancel)) {
          if (cursor == null) { out.putString("queryOutcome", "null_cursor"); }
          else if (!cursor.moveToFirst()) { out.putString("queryOutcome", "not_found"); }
          else {
            WritableMap row = Arguments.createMap();
            for (int i = 0; i < cursor.getColumnCount(); i++) {
              String column = cursor.getColumnName(i);
              if (cursor.isNull(i)) row.putNull(column);
              else if (cursor.getType(i) == Cursor.FIELD_TYPE_BLOB) row.putString(column, "[blob omitted]");
              else {
                String value = cursor.getString(i);
                row.putString(column, value.length() > 2048 ? value.substring(0, 2048) + "[truncated]" : value);
              }
            }
            if (cursor.moveToNext()) out.putString("queryOutcome", "ambiguous");
            else { out.putString("queryOutcome", "found"); out.putMap("row", row); }
          }
        }
      } catch (SecurityException e) {
        out.putString("queryOutcome", "permission_denied"); out.putString("error", e.toString());
      } catch (Exception e) {
        out.putString("queryOutcome", "error"); out.putString("error", e.toString());
      } finally {
        if (timeout != null) timeout.cancel(false);
        running.set(false);
      }
      promise.resolve(out);
    }); } catch (RejectedExecutionException e) {
      running.set(false); promise.reject("CLOSED", "The probe has been closed", e);
    }
  }
  @ReactMethod public void loadBindings(Promise promise) {
    promise.resolve(getReactApplicationContext().getSharedPreferences(
        "supernote-native-task-plugin-v1", android.content.Context.MODE_PRIVATE)
        .getString("bindings", "[]"));
  }
  @ReactMethod public void saveBindings(String json, Promise promise) {
    try {
      if (json.length() > 1048576) throw new IllegalArgumentException("Bindings exceed 1 MB");
      new org.json.JSONArray(json);
      boolean saved = getReactApplicationContext().getSharedPreferences(
          "supernote-native-task-plugin-v1", android.content.Context.MODE_PRIVATE)
          .edit().putString("bindings", json).commit();
      if (!saved) throw new IllegalStateException("Could not save task links");
      promise.resolve(true);
    } catch (Exception e) { promise.reject("SAVE_FAILED", e); }
  }
  @Override public void invalidate() {
    worker.shutdownNow(); timer.shutdownNow(); super.invalidate();
  }
}
