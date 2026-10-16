import type { ClientModule } from 'claude-code'

type Props = { label: string; color: string; hoverColor: string }
type State = { isHovered: boolean }

/**
 * A clickable label on a colored background. The desktop draws every `Button`
 * as its own native control and ignores colors inside it; a `Client` region is
 * drawn with the plugin's own colors, so the press is posted to the hooks module.
 */
const ColorButton: ClientModule<Props, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const isHovered = surface.state?.isHovered ?? false
  const isInside = (x: number, y: number) => x >= 0 && y >= 0 && x < surface.columns && y < surface.rows
  surface.onPointer(e => {
    if (e.type === 'enter' || e.type === 'leave') surface.setState({ isHovered: e.type === 'enter' })
    if (e.type === 'up' && e.button === 'left' && isInside(e.x, e.y)) surface.post('press')
  })
  surface.onKey(e => {
    if (e.key === 'return' || e.key === ' ') surface.post('press')
  })
  return (
    <Box backgroundColor={isHovered ? props.hoverColor : props.color} paddingX={2}>
      <Text color="#000000" bold>
        {props.label}
      </Text>
    </Box>
  )
}

export default ColorButton
