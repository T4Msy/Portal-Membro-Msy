package br.com.masayoshi.plataforma.call

import android.app.Activity
import android.app.AppOpsManager
import android.app.PictureInPictureParams
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Process
import android.util.Rational
import com.facebook.react.bridge.ReactContext

/**
 * Janela flutuante (Picture-in-Picture) durante a chamada — a "janelinha" que o
 * WhatsApp e o Meet usam. Ao sair do app em chamada, a sala vira uma janela pequena
 * por cima dos outros apps; a chamada continua (serviço em primeiro plano).
 *
 * Não usa "sobrepor a outros apps" (SYSTEM_ALERT_WINDOW): o Android tem a permissão
 * própria "Picture-in-picture", ligada por padrão; se o usuário a desligou, o app
 * mostra o atalho para as configurações.
 */
object Pip {
  @Volatile var inCall = false
  @Volatile private var aspectW = 9
  @Volatile private var aspectH = 16
  @Volatile var react: ReactContext? = null

  fun supported(ctx: Context): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
      ctx.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)

  fun allowed(ctx: Context): Boolean {
    if (!supported(ctx)) return false
    val ops = ctx.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_PICTURE_IN_PICTURE, Process.myUid(), ctx.packageName)
    } else {
      @Suppress("DEPRECATION")
      ops.checkOpNoThrow(AppOpsManager.OPSTR_PICTURE_IN_PICTURE, Process.myUid(), ctx.packageName)
    }
    return mode == AppOpsManager.MODE_ALLOWED
  }

  fun configure(activity: Activity?, inCall: Boolean, w: Int, h: Int) {
    this.inCall = inCall
    if (w > 0 && h > 0) {
      // O Android aceita proporções entre 1:2,39 e 2,39:1.
      val r = (w.toDouble() / h).coerceIn(1 / 2.3, 2.3)
      aspectW = (r * 1000).toInt()
      aspectH = 1000
    }
    activity?.runOnUiThread { apply(activity) }
  }

  private fun params(): PictureInPictureParams? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return null
    val b = PictureInPictureParams.Builder().setAspectRatio(Rational(aspectW, aspectH))
    // Android 12+: entra sozinho na janelinha ao sair do app (gesto ou botão início).
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) b.setAutoEnterEnabled(inCall).setSeamlessResizeEnabled(true)
    return b.build()
  }

  fun apply(activity: Activity) {
    if (!supported(activity)) return
    try {
      params()?.let { activity.setPictureInPictureParams(it) }
    } catch (_: Exception) {
      /* proporção recusada pelo aparelho */
    }
  }

  /** Android 8–11 (sem entrada automática): chamado quando o usuário sai do app. */
  fun enter(activity: Activity): Boolean {
    if (!inCall || !allowed(activity) || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
    return try {
      params()?.let { activity.enterPictureInPictureMode(it) } ?: false
    } catch (_: Exception) {
      false
    }
  }

  fun emit(inPip: Boolean) {
    react?.takeIf { it.hasActiveReactInstance() }?.emitDeviceEvent("masayoshiPip", inPip)
  }
}
