package br.com.masayoshi.plataforma.call

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Serviço em primeiro plano enquanto o usuário está numa sala de voz.
 *  - Notificação fixa: o Android não encerra o app e libera o microfone em segundo plano.
 *  - Tarefa "headless" do React Native ("MasayoshiCallKeepAlive") que nunca termina:
 *    enquanto ela existe, os timers do JavaScript continuam rodando em segundo plano.
 *    Sem isso, o sinal de vida do Supabase Realtime parava e o servidor derrubava a
 *    conexão do app em ~60 s (diagnosticado no teste real com um Samsung A32).
 */
class CallService : HeadlessJsTaskService() {
  private var wakeLock: PowerManager.WakeLock? = null

  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig =
    HeadlessJsTaskConfig("MasayoshiCallKeepAlive", Arguments.createMap(), 0, true)

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val room = intent?.getStringExtra(EXTRA_ROOM) ?: "sala de voz"
    createChannel(this)

    val open = packageManager.getLaunchIntentForPackage(packageName)
    val pending = PendingIntent.getActivity(
      this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Em chamada no MSY Space")
      .setContentText(room)
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setContentIntent(pending)
      .setOngoing(true)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()

    val camera = intent?.getBooleanExtra(EXTRA_CAMERA, false) ?: false
    val playback = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0
    val types = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val mic = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or playback
      // Câmera ligada: o tipo "camera" deixa a câmera funcionando fora do app (janelinha/segundo plano).
      listOfNotNull(if (camera) mic or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA else null, mic, playback)
    } else {
      listOf(0)
    }
    // Tenta do mais completo ao mais simples (sem permissão de câmera/microfone o tipo é recusado).
    for ((i, type) in types.withIndex()) {
      try {
        ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type)
        break
      } catch (e: Exception) {
        if (i == types.lastIndex) throw e
      }
    }

    if (wakeLock == null) {
      val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
      wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MsySpace:call").apply {
        setReferenceCounted(false)
        acquire(6 * 60 * 60 * 1000L) // no máximo 6 h
      }
    }

    // Inicia a tarefa headless (mantém os timers do JS vivos).
    super.onStartCommand(intent, flags, startId)
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
    super.onDestroy()
  }

  companion object {
    const val CHANNEL_ID = "msy_space_call"
    const val NOTIFICATION_ID = 4711
    const val EXTRA_ROOM = "room"
    const val EXTRA_CAMERA = "camera"

    fun createChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (nm.getNotificationChannel(CHANNEL_ID) == null) {
        nm.createNotificationChannel(
          NotificationChannel(CHANNEL_ID, "Chamada em andamento", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Mantém a chamada ativa com o app em segundo plano"
            setShowBadge(false)
          },
        )
      }
    }
  }
}
