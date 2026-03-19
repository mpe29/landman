// IoT platform definitions for webhook integrations.
// Adding a new platform: add an entry here + a parser block in ingest/index.ts.

export const PLATFORMS = [
  {
    id: 'ttn',
    name: 'The Things Network',
    icon: '\u{1F4E1}',
    description: 'LoRaWAN network server for IoT sensors and trackers',
    steps: [
      'Open the TTN Console at https://console.cloud.thethings.network',
      'Select your Application (or create one)',
      'Go to Integrations \u2192 Webhooks \u2192 + Add Webhook',
      'Choose "Custom webhook"',
      'Webhook ID: landman (or any name you prefer)',
      'Webhook format: JSON',
      'Base URL: paste the Webhook URL shown above',
      'Under "Enabled messages", check Uplink message',
      'Expand "Additional headers" and add:\n  Header: Authorization\n  Value: Bearer {token}  (paste the token shown above)',
      'Click "Create webhook"',
      'Your devices will appear in Landman within minutes of their next uplink.',
    ],
  },
  {
    id: 'blues',
    name: 'Blues Wireless',
    icon: '\u{1F535}',
    description: 'Cellular IoT via Notecard',
    steps: [
      'Open Notehub at https://notehub.io',
      'Select your Project (or create one)',
      'Go to Routes \u2192 Create Route',
      'Route type: General HTTP/HTTPS',
      'URL: paste the Webhook URL shown above',
      'Under HTTP Headers, add:\n  Authorization: Bearer {token}  (paste the token shown above)',
      'Select which Notefiles to forward (e.g. _track.qo, sensors.qo)',
      'Transform: None',
      'Click Save',
      'Events from your Notecards will appear in Landman as they are routed.',
    ],
  },
]

export function getPlatform(id) {
  return PLATFORMS.find((p) => p.id === id) || null
}
