import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native'
import { friendly, signIn } from '../lib/api'
import { Btn, Card, ErrorText, Input, PasswordInput, s } from '../ui/components'
import { colors } from '../ui/theme'

export function LoginScreen() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    setLoading(true)
    try {
      await signIn(identifier, password)
    } catch (e) {
      setError(friendly(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: colors.brand, fontSize: 30, fontWeight: '800', letterSpacing: 2, textAlign: 'center' }}>MSY SPACE</Text>
        <Text style={[s.muted, { textAlign: 'center', marginBottom: 24 }]}>Voz e vídeo da Masayoshi Order</Text>
        <Card>
          <Text style={[s.h1, { marginBottom: 4 }]}>Entrar</Text>
          <Text style={[s.muted, { marginBottom: 16 }]}>Mesmo e-mail e senha do Portal MSY.</Text>
          <Input label="E-mail" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" value={identifier} onChangeText={setIdentifier} />
          <PasswordInput label="Senha" value={password} onChangeText={setPassword} onSubmitEditing={() => void submit()} />
          {error && <ErrorText>{error}</ErrorText>}
          <Btn title="Entrar" onPress={() => void submit()} loading={loading} disabled={!identifier || !password} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
