package br.com.masayoshi.plataforma.call

import android.content.Intent
import android.content.pm.ActivityInfo
import android.net.Uri
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Ponte JavaScript → Android (NativeModules.CallService):
 * serviço de chamada, janela flutuante (PiP) e orientação da tela cheia.
 */
class CallServiceModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  init {
    Pip.react = ctx
  }

  override fun getName() = "CallService"

  /** Liga (ou atualiza) o serviço. Com câmera, o tipo "camera" mantém a câmera em segundo plano/na janelinha. */
  @ReactMethod
  fun start(room: String, camera: Boolean, promise: Promise) {
    try {
      val intent = Intent(ctx, CallService::class.java)
        .putExtra(CallService.EXTRA_ROOM, room)
        .putExtra(CallService.EXTRA_CAMERA, camera)
      ContextCompat.startForegroundService(ctx, intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("CALL_SERVICE", e.message, e)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    ctx.stopService(Intent(ctx, CallService::class.java))
    configurePip(false, 0, 0)
    promise.resolve(true)
  }

  /** Em chamada → sair do app abre a janela flutuante, com a proporção do vídeo principal. */
  @ReactMethod
  fun configurePip(inCall: Boolean, width: Int, height: Int) {
    Pip.configure(ctx.currentActivity, inCall, width, height)
  }

  @ReactMethod
  fun pipStatus(promise: Promise) {
    promise.resolve(if (!Pip.supported(ctx)) "unsupported" else if (Pip.allowed(ctx)) "allowed" else "denied")
  }

  /** Abre a tela do Android onde se liga "Picture-in-picture" para este app. */
  @ReactMethod
  fun openPipSettings() {
    val pkg = Uri.fromParts("package", ctx.packageName, null)
    val intents = listOf(
      Intent("android.settings.PICTURE_IN_PICTURE_SETTINGS", pkg),
      Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg),
    )
    for (i in intents) {
      try {
        ctx.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return
      } catch (_: Exception) {
        /* tenta a próxima */
      }
    }
  }

  /** Tela cheia: 'landscape' (deitado), 'portrait' (em pé) ou 'auto' (livre). */
  @ReactMethod
  fun setOrientation(mode: String) {
    val activity = ctx.currentActivity ?: return
    activity.runOnUiThread {
      activity.requestedOrientation = when (mode) {
        "landscape" -> ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        "portrait" -> ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT
        else -> ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
      }
    }
  }

  // Exigidos pelo NativeEventEmitter do React Native.
  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Double) {}
}
