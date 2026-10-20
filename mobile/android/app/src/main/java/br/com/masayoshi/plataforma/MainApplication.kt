package br.com.masayoshi.plataforma

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.oney.WebRTCModule.WebRTCModuleOptions
import br.com.masayoshi.plataforma.call.CallServicePackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList = PackageList(this).packages.apply { add(CallServicePackage()) },
    )
  }

  override fun onCreate() {
    super.onCreate()
    // Android 10+: a captura de tela exige um serviço em primeiro plano
    // (notificação "transmitindo"). A biblioteca WebRTC o inicia após o consentimento.
    WebRTCModuleOptions.getInstance().enableMediaProjectionService = true
    loadReactNative(this)
  }
}
