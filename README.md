# GREEN HOUSE — Sports & Cultural Participation Portal

School: REV. WILLIAM WARD SENIOR SECONDARY SCHOOL  
Motto: UNITED IN STRENGTH. UNSTOPPABLE IN SPIRIT.

## Included support files
- `manifest.json`: installable web app metadata.
- `sw.js`: minimal service worker shell fallback; does not cache database/auth data.
- `privacy.html`: privacy notice starter template. Review with school management before use.
- `favicon.svg`: simple Green House icon.

## Integration notes
1. Keep your existing, complete `index.html` and the approved House logo image (`pic1.png`) in this folder. This package does not replace or reconstruct the original portal HTML.
2. In the existing `index.html` `<head>`, add: `<link rel="manifest" href="manifest.json">` and `<link rel="icon" href="favicon.svg">`.
3. Before the closing `</body>` tag, add: `<script>if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.error));}</script>`.
4. Add a link to `privacy.html` in the portal footer.
5. Test deployment using dummy entries only. Verify Supabase Row Level Security and manager permissions before collecting real student data.

This support package does not include Supabase configuration, credentials, or the original portal's source code.
