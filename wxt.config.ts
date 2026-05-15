import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: '.output',
  manifest: {
    name: 'Granot Sync',
    description: 'Sync data from Granot CRM to the Vantage server',
    permissions: ['storage', 'activeTab', 'tabs'],
    host_permissions: [
      // Granot CRM (HelloMoving / Eagle)
      'https://eagle.hellomoving.com/*',
      'https://*.granot.com/*',
      'https://*.granot.co.il/*',
      'http://localhost/*',
      'https://vantage-movers-servers.vercel.app/*',
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
