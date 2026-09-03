import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: '.output',
  // Keep this off 3000–3010. Vantage Admin, partner landings, and Vite's
  // default scan all sit there; WXT will still bind localhost:3000 even when
  // another process already owns 0.0.0.0:3000.
  dev: {
    server: {
      port: 3400,
      origin: 'http://localhost:3400',
      strictPort: true,
    },
  },
  manifest: {
    name: 'Granot Sync',
    description: 'Sync data from Granot CRM to the Vantage server',
    permissions: ['storage', 'activeTab', 'tabs', 'webNavigation', 'alarms'],
    host_permissions: [
      // Granot CRM (HelloMoving / Eagle)
      'https://eagle.hellomoving.com/*',
      'https://*.granot.com/*',
      'https://*.granot.co.il/*',
      'http://localhost/*',
      'https://vantage-movers-main-server.vercel.app/*',
    ],
    browser_specific_settings: {
      gecko: {
        id: 'granot-sync@vantage.dev',
        data_collection_permissions: {
          // Reads table/content from Granot CRM pages the user is viewing
          required: ['websiteContent'],
        },
      },
    },
  },
});
