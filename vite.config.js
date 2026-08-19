import {defineConfig} from 'vite';
import {resolve} from 'node:path';

export default defineConfig({
  build:{
    rollupOptions:{
      input:{
        main:resolve(import.meta.dirname,'index.html'),
        company:resolve(import.meta.dirname,'company.html'),
        ventures:resolve(import.meta.dirname,'ventures.html'),
        team:resolve(import.meta.dirname,'team.html'),
        contact:resolve(import.meta.dirname,'contact.html'),
        apply:resolve(import.meta.dirname,'apply.html'),
        thanks:resolve(import.meta.dirname,'thanks.html')
      }
    }
  }
});
