import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { fetchInstalledAppsFromServer, installAppOnServer } from '../services/storeApi';

const STORAGE_KEY = 'tattletale.installedApps.v1';

function uniq(list) {
  return Array.from(new Set(list));
}

const useInstallStore = create(
  persist(
    (set, get) => ({
      installedAppIds: [],

      isInstalled: (appId) => get().installedAppIds.includes(appId),

      syncFromServer: async () => {
        const installedAppIds = await fetchInstalledAppsFromServer();
        set({ installedAppIds: uniq(installedAppIds) });
      },

      installViaServer: async (appId) => {
        const installedAppIds = await installAppOnServer(appId);
        set({ installedAppIds: uniq(installedAppIds) });
      },

      install: (appId) => {
        set((state) => ({
          installedAppIds: uniq([...state.installedAppIds, appId]),
        }));
      },

      uninstall: (appId) => {
        set((state) => ({
          installedAppIds: state.installedAppIds.filter((id) => id !== appId),
        }));
      },

      resetInstalls: () => {
        set({ installedAppIds: [] });
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      partialize: (state) => ({ installedAppIds: state.installedAppIds }),
    }
  )
);

export default useInstallStore;

