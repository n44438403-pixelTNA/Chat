## Packages
date-fns | Formatting relative time for last seen and message timestamps
framer-motion | Smooth animations and page transitions

## Notes
- Theme is a bold, dark, neon-accented aesthetic (Cyberpunk/Maximalist vibe).
- App Lock is implemented globally listening to the 'visibilitychange' API and user inactivity.
- Standard API endpoints used for chat, with simulated real-time via TanStack Query polling (`refetchInterval`).
- The provided Firebase config is not used as per the requirement to rely on the defined API contract, but standard robust polling is implemented to match the chat experience.
