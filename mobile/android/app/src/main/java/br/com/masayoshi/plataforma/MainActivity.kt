package br.com.masayoshi.plataforma

import android.content.res.Configuration
import android.os.Build
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import br.com.masayoshi.plataforma.call.Pip

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "MasayoshiMobile"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  /** Saiu do app (botão início/recentes) em chamada: abre a janela flutuante (Android 8–11). */
  override fun onUserLeaveHint() {
    super.onUserLeaveHint()
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) Pip.enter(this)
  }

  override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: Configuration) {
    super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
    Pip.emit(isInPictureInPictureMode)
  }
}
