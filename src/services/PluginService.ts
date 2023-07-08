export class PluginService {
  static instance: PluginService;
  private readonly plugins: Record<string, IPlugin> = {
    'random_number': { id: 'random_number', name: 'Random number', url: 'https://andreas-schoch.github.io/p2p-test-plugin/', description: '', version: '0.0.1' },
    'paint': { id: 'paint', name: 'Paint', url: 'https://andreas-schoch.github.io/quackamole-plugin-paint/', description: '', version: '0.0.1' },
    'gomoku': { id: 'gomoku', name: 'Gomoku', url: 'https://quackamole-dev.github.io/quackamole-plugin-gomoku/', description: '', version: '0.0.1' },
    '2d_shooter': { id: '2d_shooter', name: '2d Shooter (WIP)', url: 'https://andreas-schoch.github.io/quackamole-plugin-2d-topdown-shooter/', description: '', version: '0.0.1' },
    'breakout_game': { id: 'breakout_game', name: 'Breakout game', url: 'https://andreas-schoch.github.io/breakout-game/', description: '', version: '0.0.1' },
    'snowboarding_game': { id: 'snowboarding_game', name: 'Snowboarding Game', url: 'https://snowboarding.game', description: '', version: '0.0.1' }
  };

  constructor() {
    PluginService.instance = this;
  }

  getAll(): IPlugin[] {
    return Object.values(this.plugins);
  }

  getPluginById(id: string): IPlugin | undefined {
    return this.plugins[id];
  }
}

export interface IPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  url: string;
}
