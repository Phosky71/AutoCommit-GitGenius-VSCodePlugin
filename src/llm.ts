import { AppConfig } from './config';

const SYSTEM_PROMPT = `
You are an expert developer and a strict Git commit message generator.
Analyze the diff and generate a comprehensive commit message using the Conventional Commits standard.

RULES:
1. The FIRST LINE must be the title: <type>(<scope>): <description> (under 72 characters).
2. Valid types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.
3. The title description MUST focus on the WHY and the IMPACT of the change.
4. If multiple files/modules are changed, you MUST add a blank line after the title, followed by a bulleted list explaining what was changed in each file/module.
5. NEVER wrap the output in quotes, backticks, code blocks, or markdown (\`\`\`).
6. NEVER output conversational text like "Here is your message".
`;

export async function callLlm(
    provider: string,
    baseUrl: string,
    model: string,
    apiKey: string,
    userContent: string
): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000); // 45s timeout

    try {
        const isAnthropic = provider.toLowerCase() === 'anthropic';
        const endpoint = isAnthropic
            ? `${baseUrl.replace(/\/$/, '')}/messages`
            : `${baseUrl.replace(/\/$/, '')}/chat/completions`;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };

        let body: any;

        if (isAnthropic) {
            headers['x-api-key'] = apiKey;
            headers['anthropic-version'] = '2023-06-01';
            body = {
                model,
                system: SYSTEM_PROMPT,
                max_tokens: 256,
                messages: [{ role: 'user', content: userContent }]
            };
        } else {
            if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
            if (provider.toLowerCase() === 'openrouter') {
                headers['HTTP-Referer'] = 'vscode-autocommit';
                headers['X-Title'] = 'Auto Commit';
            }
            body = {
                model,
                temperature: 0.3,
                max_tokens: 256,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: userContent }
                ]
            };
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: controller.signal as any
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`LLM API error (HTTP ${response.status}): ${errText}`);
        }

        const data = await response.json() as any;

        if (isAnthropic) {
            if (!data.content || !data.content.length) throw new Error('Anthropic returned empty content');
            return data.content[0].text;
        } else {
            if (!data.choices || !data.choices.length) throw new Error('LLM returned no choices');
            return data.choices[0].message.content;
        }

    } finally {
        clearTimeout(timeout);
    }
}