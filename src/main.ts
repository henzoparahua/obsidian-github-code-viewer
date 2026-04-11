import { App, Plugin, PluginSettingTab, Setting, requestUrl } from 'obsidian';
import { codeToHtml } from 'shiki';

const en = {
	settingsTitle: 'GitHub Code Viewer Settings',
	tokenName: 'GitHub Personal Access Token (PAT)',
	tokenDesc: 'Required only if you want to display code from private repositories. The token is securely saved locally on your computer.',
	tokenPlaceholder: 'ghp_...',
	invalidUrl: 'Invalid GitHub URL:',
	loading: 'Loading...',
	fetchError: 'Failed to fetch the file. If it is a private repository, check your Token in the settings.',
	error: 'Error:'
};

const pt = {
	settingsTitle: 'Configurações do GitHub Code Viewer',
	tokenName: 'GitHub Personal Access Token (PAT)',
	tokenDesc: 'Necessário apenas se você quiser exibir códigos de repositórios privados. O token fica salvo localmente de forma segura no seu computador.',
	tokenPlaceholder: 'ghp_...',
	invalidUrl: 'URL do GitHub inválida:',
	loading: 'Carregando...',
	fetchError: 'Falha ao buscar o arquivo. Se for um repositório privado, verifique seu Token nas configurações.',
	error: 'Erro:'
};

const es = {
	settingsTitle: 'Configuración de GitHub Code Viewer',
	tokenName: 'Token de acceso personal de GitHub (PAT)',
	tokenDesc: 'Necesario solo si desea mostrar código de repositorios privados. El token se guarda localmente de forma segura en su computadora.',
	tokenPlaceholder: 'ghp_...',
	invalidUrl: 'URL de GitHub no válida:',
	loading: 'Cargando...',
	fetchError: 'Error al obtener el archivo. Si es un repositorio privado, verifique su Token en la configuración.',
	error: 'Error:'
};

// Mapeamento dos idiomas
const locales: Record<string, typeof en> = {
	'en': en,
	'pt': pt,
	'pt-BR': pt,
	'pt-PT': pt,
	'es': es,
};

function t(key: keyof typeof en): string {
	// Pega o idioma atual do Obsidian. Se não achar, usa 'pt-br' como padrão.
	const lang = window.localStorage.getItem('language') || 'pt-BR';
	const locale = locales[lang] || pt;
	return locale[key] || pt[key];
}

// --- CONFIGURAÇÕES DO PLUGIN ---
interface GitHubCodeViewerSettings {
	githubToken: string;
}

const DEFAULT_SETTINGS: GitHubCodeViewerSettings = {
	githubToken: ''
}

interface ParsedGitHubUrl {
	owner: string; repo: string; branch: string; path: string; startLine?: number; endLine?: number;
}

function parseGitHubUrl(rawUrl: string): ParsedGitHubUrl | null {
	try {
		let url = rawUrl.trim();
		if (!url.startsWith("http://") && !url.startsWith("https://")) {
			url = "https://" + url;
		}

		const urlObj = new URL(url);
		if (!urlObj.hostname.includes("github.com")) return null;

		const hash = urlObj.hash;
		let startLine: number | undefined;
		let endLine: number | undefined;

		if (hash) {
			const lineMatch = hash.match(/#L(\d+)(?:-L(\d+))?/);
			// Corrigido para acessar os índices corretamente
			if (lineMatch && lineMatch) {
				startLine = parseInt(lineMatch[1] || "", 10);
				if (lineMatch) {
					endLine = parseInt(lineMatch[2] || "", 10);
				} else {
					endLine = startLine;
				}
			}
		}

		const pathParts = urlObj.pathname.split("/").filter(Boolean);
		if (pathParts.length < 5 || pathParts[2] !== "blob") return null;

		const owner = pathParts[0] || "";
		const repo = pathParts[1] || "";
		const branch = pathParts[3] || "";

		if (!owner || !repo || !branch) return null;

		return {
			owner, repo, branch,
			path: pathParts.slice(4).join("/"),
			startLine, endLine
		};
	} catch (e) { return null; }
}

function getRawUrl(parsed: ParsedGitHubUrl): string {
	return `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${parsed.branch}/${parsed.path}`;
}

function getLanguageInfo(filename: string): { display: string; ext: string } {
	const ext = filename.split(".").pop()?.toLowerCase() ?? "text";

	const displayNames: Record<string, string> = {
		js: "JavaScript", ts: "TypeScript", cpp: "C++", c: "C", cs: "C#",
		py: "Python", rb: "Ruby", md: "Markdown", html: "HTML", css: "CSS",
		json: "JSON", yml: "YAML", yaml: "YAML", sh: "Shell", rs: "Rust",
		go: "Go", java: "Java", php: "PHP", kt: "Kotlin", swift: "Swift"
	};

	return {
		display: displayNames[ext] || ext.toUpperCase(),
		ext: ext
	};
}

export default class GitHubCodePlugin extends Plugin {
	settings: GitHubCodeViewerSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new GitHubCodeViewerSettingTab(this.app, this));

		this.registerMarkdownCodeBlockProcessor("github", async (source, el) => {
			const url = source.trim();
			const parsed = parseGitHubUrl(url);

			if (!parsed) {
				// Usando a tradução
				el.createEl("div", { text: `${t('invalidUrl')} "${url}"`, cls: "gcv-error" });
				return;
			}

			const container = el.createEl("div", { cls: "gcv-container" });
			container.createEl("div", { text: t('loading'), cls: "gcv-loading" });

			try {
				const fileName = parsed.path.split("/").pop() ?? "arquivo";
				const languageInfo = getLanguageInfo(fileName);

				const headers: Record<string, string> = {};
				if (this.settings.githubToken) {
					headers["Authorization"] = `Bearer ${this.settings.githubToken}`;
				}

				const [userResponse, codeResponse] = await Promise.allSettled([
					requestUrl({ url: `https://api.github.com/users/${parsed.owner}`, headers }),
					requestUrl({ url: getRawUrl(parsed), headers })
				]);

				if (codeResponse.status === "rejected") throw new Error(t('fetchError'));

				const text = codeResponse.value.text;
				let codeContent = text;

				if (parsed.startLine !== undefined) {
					const lines = text.split("\n");
					const start = parsed.startLine - 1;
					const end = parsed.endLine ?? parsed.startLine;
					codeContent = lines.slice(start, end).join("\n");
				}

				let highlightedHtml = "";
				try {
					highlightedHtml = await codeToHtml(codeContent, {
						lang: languageInfo.ext,
						theme: "github-dark",
					});
				} catch (e) {
					highlightedHtml = await codeToHtml(codeContent, {
						lang: "text",
						theme: "github-dark",
					});
				}

				let avatarUrl = "";
				let profileUrl = "";
				if (userResponse.status === "fulfilled" && userResponse.value.json) {
					avatarUrl = userResponse.value.json.avatar_url;
					profileUrl = userResponse.value.json.html_url;
				}

				container.empty();

				container.innerHTML = `
                    <div class="gcv-inner">
                        <div class="gcv-header-flex">
                            ${avatarUrl
						? `<a href="${profileUrl}" target="_blank" class="gcv-avatar-link"><img src="${avatarUrl}" class="gcv-avatar"/></a>`
						: `<div class="gcv-avatar-fallback"></div>`}
                            
                            <div class="gcv-content">
                                <a href="${url}" target="_blank" class="gcv-title">
                                    ${fileName} <span>${parsed.owner}/${parsed.repo}</span>
                                </a>
                                
                                <div class="gcv-code-wrapper">
                                    <div class="shiki-container">${highlightedHtml}</div>
                                </div>
                                
                                <div class="gcv-footer">
                                    <span>${parsed.branch}</span>
                                    <span class="gcv-dot">·</span>
                                    <span>${languageInfo.display}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
			} catch (err) {
				container.empty();
				container.createEl("div", { text: `${t('error')} ${(err as Error).message}`, cls: "gcv-error" });
			}
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

// --- TELA DE CONFIGURAÇÕES (UI) ---
class GitHubCodeViewerSettingTab extends PluginSettingTab {
	plugin: GitHubCodePlugin;

	constructor(app: App, plugin: GitHubCodePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		// Título usando a tradução
		containerEl.createEl('h2', { text: t('settingsTitle') });

		new Setting(containerEl)
			// Nome e descrição usando a tradução
			.setName(t('tokenName'))
			.setDesc(t('tokenDesc'))
			.addText(text => {
				text
					.setPlaceholder(t('tokenPlaceholder'))
					.setValue(this.plugin.settings.githubToken)
					.onChange(async (value) => {
						this.plugin.settings.githubToken = value.trim();
						await this.plugin.saveSettings();
					});

				text.inputEl.type = "password";
				return text;
			});
	}
}
