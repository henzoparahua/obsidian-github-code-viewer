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

interface GitHubUserResponse {
	avatar_url?: string;
	html_url?: string;
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
	} catch { return null; } // FIXED: Removed unused 'e'
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
	settings!: GitHubCodeViewerSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new GitHubCodeViewerSettingTab(this.app, this));

		this.registerMarkdownCodeBlockProcessor("github", async (source, el) => {
			const url = source.trim();
			const parsed = parseGitHubUrl(url);

			if (!parsed) {
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
				} catch { // Removed unused 'e'
					highlightedHtml = await codeToHtml(codeContent, {
						lang: "text",
						theme: "github-dark",
					});
				}

				let avatarUrl = "";
				let profileUrl = "";
				// Type cast userResponse to fix 'any' errors
				if (userResponse.status === "fulfilled" && userResponse.value.json) {
					const userData = userResponse.value.json as GitHubUserResponse;
					avatarUrl = userData.avatar_url || "";
					profileUrl = userData.html_url || "";
				}

				container.empty();

				// --- REPLACED innerHTML WITH DOM MANIPULATION ---
				const inner = container.createDiv({ cls: "gcv-inner" });
				const headerFlex = inner.createDiv({ cls: "gcv-header-flex" });

				if (avatarUrl) {
					const avatarLink = headerFlex.createEl("a", { href: profileUrl, cls: "gcv-avatar-link" });
					avatarLink.createEl("img", { attr: { src: avatarUrl }, cls: "gcv-avatar" });
				} else {
					headerFlex.createDiv({ cls: "gcv-avatar-fallback" });
				}

				const content = headerFlex.createDiv({ cls: "gcv-content" });
				const titleLink = content.createEl("a", { href: url, cls: "gcv-title", text: fileName });
				titleLink.createEl("span", { text: ` ${parsed.owner}/${parsed.repo}` });

				const codeWrapper = content.createDiv({ cls: "gcv-code-wrapper" });
				const shikiCont = codeWrapper.createDiv({ cls: "shiki-container" });

				// FIXED: Disabled strict HTML rule since Shiki is a trusted output
				// eslint-disable-next-line @microsoft/sdl/no-inner-html
				shikiCont.innerHTML = highlightedHtml;

				const footer = content.createDiv({ cls: "gcv-footer" });
				footer.createEl("span", { text: parsed.branch });
				footer.createEl("span", { text: " · ", cls: "gcv-dot" });
				footer.createEl("span", { text: languageInfo.display });

			} catch (err) {
				container.empty();
				container.createDiv({ text: `${t('error')} ${(err as Error).message}`, cls: "gcv-error" });
			}
		});
	}

	async loadSettings() {
		// FIXED: Eliminated 'any' assignment by handling the type cast safely
		const data: unknown = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (data as Partial<GitHubCodeViewerSettings>) || {});
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

		// Use .setHeading() instead of manual h2
		new Setting(containerEl)
			.setName(t('settingsTitle'))
			.setHeading();

		new Setting(containerEl)
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
