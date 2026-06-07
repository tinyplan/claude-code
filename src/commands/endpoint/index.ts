import type { Command } from '../../commands.js'

const endpoint = {
  type: 'local',
  name: 'endpoint',
  description: 'Switch extra API endpoint (DeepSeek, Zhipu, Moonshot, etc.)',
  aliases: ['ep'],
  argumentHint: '[name|list|unset]',
  supportsNonInteractive: true,
  load: () => import('./endpoint.js'),
} satisfies Command

export default endpoint
