/**
 * Citatra  Plugin System (placeholder)
 *
 * Reserved for future plugin extensibility.
 * Currently unused in the open-source version.
 */

export interface CitatraPlugin {
  id: string;
  name: string;
  version: string;
  initialize?: () => Promise<void>;
}

class PluginRegistry {
  private plugins: Map<string, CitatraPlugin> = new Map();

  register(plugin: CitatraPlugin): void {
    this.plugins.set(plugin.id, plugin);
  }

  get(id: string): CitatraPlugin | undefined {
    return this.plugins.get(id);
  }

  getAll(): CitatraPlugin[] {
    return Array.from(this.plugins.values());
  }
}

export const pluginRegistry = new PluginRegistry();

export async function loadPlugins(): Promise<void> {
  // No plugins to load in open-source version
}
