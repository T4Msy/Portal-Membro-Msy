import { useState, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'
import { colors } from './theme'

export function Btn({ title, onPress, tone = 'primary', disabled, loading }: { title: string; onPress: () => void; tone?: 'primary' | 'secondary' | 'danger'; disabled?: boolean; loading?: boolean }) {
  const bg = tone === 'primary' ? colors.brandDark : tone === 'danger' ? colors.wine : colors.ink600
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }]}
      accessibilityRole="button"
    >
      {loading ? <ActivityIndicator color={colors.white} /> : <Text style={[s.btnText, tone === 'danger' && { color: colors.danger }]}>{title}</Text>}
    </Pressable>
  )
}

export function Input({ label, ...rest }: TextInputProps & { label: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.silver700} style={s.input} {...rest} />
    </View>
  )
}

export function PasswordInput({ label, ...rest }: TextInputProps & { label: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>{label}</Text>
      <View>
        <TextInput placeholderTextColor={colors.silver700} style={[s.input, { paddingRight: 64 }]} secureTextEntry={!visible} {...rest} />
        <Pressable onPress={() => setVisible((v) => !v)} style={s.eye} accessibilityLabel={visible ? 'Esconder senha' : 'Mostrar senha'}>
          <Text style={{ color: colors.silver500, fontSize: 13 }}>{visible ? 'Ocultar' : 'Mostrar'}</Text>
        </Pressable>
      </View>
    </View>
  )
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={s.card}>{children}</View>
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <Text style={s.error}>{children}</Text>
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink900 },
  btn: { height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 8 },
  btnText: { color: colors.white, fontWeight: '600', fontSize: 15 },
  label: { color: colors.silver500, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' },
  input: { height: 46, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.black, color: colors.white, paddingHorizontal: 12, fontSize: 15 },
  eye: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 64, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.ink800, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 18 },
  error: { color: colors.danger, backgroundColor: '#2a0a12', padding: 10, borderRadius: 8, marginBottom: 8, fontSize: 13 },
  h1: { color: colors.white, fontSize: 20, fontWeight: '700' },
  muted: { color: colors.silver500, fontSize: 13 },
})
