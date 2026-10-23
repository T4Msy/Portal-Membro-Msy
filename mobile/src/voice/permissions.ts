import { PermissionsAndroid, Platform } from 'react-native'

/** Microfone e notificações (a notificação "Em chamada" mantém a call viva em segundo plano). */
export async function askCallPermissions(): Promise<void> {
  if (Platform.OS !== 'android') return
  const wanted = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]
  if (Number(Platform.Version) >= 33) wanted.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)
  await PermissionsAndroid.requestMultiple(wanted)
}

export async function askCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true
  const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA)
  return r === PermissionsAndroid.RESULTS.GRANTED
}
