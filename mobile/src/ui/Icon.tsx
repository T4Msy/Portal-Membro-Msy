import FontAwesome6 from 'react-native-vector-icons/FontAwesome6'
import { colors } from './theme'

/** Ícone Font Awesome 6 (sólido por padrão), os mesmos nomes do site (sem o prefixo "fa-"). */
export function Icon({ name, size = 18, color = colors.silver300, brand = false }: { name: string; size?: number; color?: string; brand?: boolean }) {
  return brand ? <FontAwesome6 name={name} size={size} color={color} brand /> : <FontAwesome6 name={name} size={size} color={color} solid />
}
