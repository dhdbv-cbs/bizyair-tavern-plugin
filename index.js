// ==UserScript==
// @name         BizyAir Image Generator
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  自动检测 image##描述## 格式并生成图片
// @author       Your Name
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const extensionName = "bizyair-image-generator";

    const DEFAULT_NEGATIVE_PROMPT_LEGACY = "blurry, noisy, messy, lowres, jpeg, artifacts, ill, distorted, malformed, text, watermark, signature, username, artist name, logo";
    const DEFAULT_NEGATIVE_PROMPT_FACE = "text, watermark,worst quality.multiple views";
    const DEFAULT_NEGATIVE_PROMPT_ZIMAGE = "blurry ugly bad";

    const BASE_TEMPLATES = {
        legacy: {
            id: "legacy",
            label: "二次元简单生图 (44306)",
            defaultWebAppId: 44306,
            hasSeedControl: true,
            outputIndexFromEnd: 1,
            positivePromptKey: "31:CLIPTextEncode.text",
            negativePromptKey: "32:CLIPTextEncode.text",
            defaultParams: {
                positivePrompt: "",
                negativePrompt: DEFAULT_NEGATIVE_PROMPT_LEGACY,
                width: 832,
                height: 1216,
                steps: 20,
                seed: 101,
                cfg: 8,
                sampler: "euler_ancestral",
                scaleBy: 1.2,
                randomSeed: true,
                scheduler: "",
                denoise: "",
                aspectRatio: "",
                resolution: ""
            },
            buildParams: (stored, seedValue) => ({
                "27:KSampler.seed": seedValue,
                "27:KSampler.steps": parseInt(stored.steps),
                "27:KSampler.sampler_name": stored.sampler,
                "61:CM_SDXLExtendedResolution.resolution": `${stored.width}x${stored.height}`,
                "69:DF_Latent_Scale_by_ratio.modifier": parseFloat(stored.scaleBy),
                "31:CLIPTextEncode.text": stored.positivePrompt || "",
                "32:CLIPTextEncode.text": stored.negativePrompt || "",
                "54:EmptyLatentImage.batch_size": 1,
                "57:dynamicThresholdingFull.mimic_scale": parseFloat(stored.cfg)
            })
        },
        face_detailer: {
            id: "face_detailer",
            label: "二次元精修生图 (47362)",
            defaultWebAppId: 47362,
            hasSeedControl: true,
            outputIndexFromEnd: 1,
            positivePromptKey: "93:CLIPTextEncode.text",
            negativePromptKey: "55:CLIPTextEncode.text",
            defaultParams: {
                positivePrompt: "",
                negativePrompt: DEFAULT_NEGATIVE_PROMPT_FACE,
                width: 960,
                height: 1280,
                steps: 20,
                seed: 101,
                cfg: 7,
                sampler: "euler",
                scaleBy: 1.5,
                randomSeed: true,
                scheduler: "simple",
                denoise: "",
                aspectRatio: "",
                resolution: ""
            },
            buildParams: (stored, seedValue) => ({
                "93:CLIPTextEncode.text": stored.positivePrompt || "",
                "55:CLIPTextEncode.text": stored.negativePrompt || "",
                "47:EmptyLatentImage.width": parseInt(stored.width),
                "47:EmptyLatentImage.height": parseInt(stored.height),
                "47:EmptyLatentImage.batch_size": 1,
                // Some 47362 workflow variants still use a KSampler seed as the base latent source.
                "27:KSampler.seed": seedValue,
                "89:FaceDetailer.steps": parseInt(stored.steps),
                "89:FaceDetailer.seed": seedValue,
                "89:FaceDetailer.cfg": parseFloat(stored.cfg),
                "89:FaceDetailer.sampler_name": stored.sampler,
                "89:FaceDetailer.scheduler": stored.scheduler || "simple",
                "74:LatentUpscaleBy.scale_by": parseFloat(stored.scaleBy)
            })
        },
        zimage: {
            id: "zimage",
            label: "zimage生图 (48570)",
            defaultWebAppId: 48570,
            hasSeedControl: true,
            outputIndexFromEnd: 1,
            positivePromptKey: "6:CLIPTextEncode.text",
            negativePromptKey: "7:CLIPTextEncode.text",
            defaultParams: {
                positivePrompt: "",
                negativePrompt: DEFAULT_NEGATIVE_PROMPT_ZIMAGE,
                width: 1024,
                height: 1024,
                steps: 10,
                seed: 101,
                cfg: 1,
                sampler: "euler",
                scaleBy: 1,
                randomSeed: true,
                scheduler: "simple",
                denoise: 1,
                aspectRatio: "",
                resolution: ""
            },
            buildParams: (stored, seedValue) => ({
                "3:KSampler.seed": seedValue,
                "3:KSampler.steps": parseInt(stored.steps),
                "3:KSampler.cfg": parseFloat(stored.cfg),
                "3:KSampler.sampler_name": stored.sampler,
                "3:KSampler.scheduler": stored.scheduler || "simple",
                "3:KSampler.denoise": parseFloat(stored.denoise ?? 1),
                "6:CLIPTextEncode.text": stored.positivePrompt || "",
                "7:CLIPTextEncode.text": stored.negativePrompt || "",
                "13:EmptySD3LatentImage.width": parseInt(stored.width),
                "13:EmptySD3LatentImage.height": parseInt(stored.height),
                "13:EmptySD3LatentImage.batch_size": 1
            })
        },
        flux: {
            id: "flux",
            label: "flux生图 (44324)",
            defaultWebAppId: 44324,
            hasSeedControl: false,
            outputIndexFromEnd: 1,
            positivePromptKey: "76:PrimitiveStringMultiline.value",
            negativePromptKey: null,
            defaultParams: {
                positivePrompt: "",
                negativePrompt: "",
                width: 1024,
                height: 1536,
                steps: 10,
                seed: 101,
                cfg: 1,
                sampler: "euler",
                scaleBy: 1,
                randomSeed: true,
                scheduler: "",
                denoise: "",
                aspectRatio: "",
                resolution: ""
            },
            buildParams: (stored) => ({
                "76:PrimitiveStringMultiline.value": stored.positivePrompt || "",
                "84:PrimitiveInt.value": parseInt(stored.width),
                "85:PrimitiveInt.value": parseInt(stored.height),
                "83:EmptyFlux2LatentImage.batch_size": 1
            })
        }
    };

    const LEGACY_WEB_APP_KEY = "bizyair_web_app_id";
    const TEMPLATE_WEB_APP_PREFIX = "bizyair_web_app_id_";
    const TEMPLATE_PARAMS_PREFIX = "bizyair_params_";
    const CUSTOM_TEMPLATES_KEY = "bizyair_custom_templates";
    const SLOT_SELECTION_KEY = "bizyair_slot_selection";
    const BIZYAIR_LLM_URL_KEY = "bizyair_llm_url";
    const BIZYAIR_LLM_KEY_KEY = "bizyair_llm_key";
    const BIZYAIR_LLM_MODEL_KEY = "bizyair_llm_model";
    const BIZYAIR_PRESET_PREFIX = "bizyair_prompt_";
    const BIZYAIR_AUTO_TAG_KEY = "bizyair_auto_tag";
    const BIZYAIR_CONTEXT_KEY = "bizyair_tag_context";
    const BIZYAIR_AUTO_TAG_AFTER_MESSAGE_KEY = "bizyair_auto_tag_after_message";
    const BIZYAIR_CONTEXT_REGEX_KEY = "bizyair_context_regex";

    function deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function loadPromptPresetList(type) {
        try {
            const parsed = JSON.parse(localStorage.getItem(`${BIZYAIR_PRESET_PREFIX}${type}`) || "[]");
            if (!Array.isArray(parsed)) return [];
            return parsed.map(item => ({
                id: item.id || Date.now() + Math.floor(Math.random() * 1000),
                name: item.name || "未命名",
                content: item.content || "",
                active: !!item.active,
                history: Array.isArray(item.history) ? item.history : []
            }));
        } catch (e) {
            console.warn(`读取 ${type} 预设失败:`, e);
            return [];
        }
    }

    function ensureExclusivePresetState(type, list) {
        if (type === "char") return list;
        let foundActive = false;
        list.forEach(item => {
            if (!item.active) return;
            if (!foundActive) {
                foundActive = true;
                return;
            }
            item.active = false;
        });
        if (!foundActive && list[0]) {
            list[0].active = true;
        }
        return list;
    }

    function loadCustomTemplateDefs() {
        const raw = localStorage.getItem(CUSTOM_TEMPLATES_KEY);
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.warn("读取自定义模板失败:", e);
            return [];
        }
    }

    function saveCustomTemplateDefs(defs) {
        localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(defs));
    }

    function buildCustomTemplate(def) {
        const baseInput = def.baseInput || {};
        const paramKeyMap = def.paramKeyMap || {};
        const defaultParams = def.defaultParams || buildDefaultParamsFromInput(
            baseInput,
            paramKeyMap,
            { positiveKey: def.positivePromptKey, negativeKey: def.negativePromptKey }
        );
        return {
            id: def.id,
            label: def.label || def.id,
            defaultWebAppId: def.webAppId,
            hasSeedControl: !!paramKeyMap.seed,
            outputIndexFromEnd: def.outputIndexFromEnd || 1,
            positivePromptKey: def.positivePromptKey || null,
            negativePromptKey: def.negativePromptKey || null,
            suppressPreviewOutput: def.suppressPreviewOutput !== undefined ? def.suppressPreviewOutput : true,
            defaultParams,
            buildParams: (stored, seedValue) => {
                const params = deepClone(baseInput);

                const applyNumber = (key, value) => {
                    const num = Number(value);
                    if (Number.isFinite(num)) {
                        params[key] = num;
                    }
                };

                if (paramKeyMap.seed) params[paramKeyMap.seed] = seedValue;
                if (paramKeyMap.steps && stored.steps !== undefined && stored.steps !== "") {
                    applyNumber(paramKeyMap.steps, stored.steps);
                }
                if (paramKeyMap.cfg && stored.cfg !== undefined && stored.cfg !== "") {
                    applyNumber(paramKeyMap.cfg, stored.cfg);
                }
                if (paramKeyMap.sampler && stored.sampler) params[paramKeyMap.sampler] = stored.sampler;
                if (paramKeyMap.scheduler && stored.scheduler) params[paramKeyMap.scheduler] = stored.scheduler;
                if (paramKeyMap.denoise && stored.denoise !== undefined && stored.denoise !== "") {
                    applyNumber(paramKeyMap.denoise, stored.denoise);
                }
                if (paramKeyMap.scaleBy && stored.scaleBy !== undefined && stored.scaleBy !== "") {
                    applyNumber(paramKeyMap.scaleBy, stored.scaleBy);
                }
                if (paramKeyMap.width && stored.width !== undefined && stored.width !== "") {
                    applyNumber(paramKeyMap.width, stored.width);
                }
                if (paramKeyMap.height && stored.height !== undefined && stored.height !== "") {
                    applyNumber(paramKeyMap.height, stored.height);
                }
                if (paramKeyMap.aspectRatio && stored.aspectRatio) params[paramKeyMap.aspectRatio] = stored.aspectRatio;
                if (paramKeyMap.resolution && stored.resolution) params[paramKeyMap.resolution] = stored.resolution;

                return params;
            }
        };
    }

    function buildCustomTemplatesMap(defs) {
        const map = {};
        defs.forEach(def => {
            if (def && def.id) {
                map[def.id] = buildCustomTemplate(def);
            }
        });
        return map;
    }

    let customTemplateDefs = loadCustomTemplateDefs();
    let customTemplates = buildCustomTemplatesMap(customTemplateDefs);

    function refreshCustomTemplates() {
        customTemplateDefs = loadCustomTemplateDefs();
        customTemplates = buildCustomTemplatesMap(customTemplateDefs);
    }

    function getAllTemplates() {
        return { ...BASE_TEMPLATES, ...customTemplates };
    }

    function normalizeTemplateId(templateId) {
        const templates = getAllTemplates();
        return templateId && templates[templateId] ? templateId : "legacy";
    }

    function getTemplateDef(templateId) {
        return getAllTemplates()[normalizeTemplateId(templateId)];
    }

    function templateSupportsSeed(templateId) {
        const template = getTemplateDef(templateId);
        if (!template) return false;
        return template.hasSeedControl !== false;
    }

    function normalizeRandomSeedValue(value) {
        if (typeof value === "boolean") return value;
        if (typeof value === "string") {
            const normalized = value.trim().toLowerCase();
            if (normalized === "true") return true;
            if (normalized === "false") return false;
        }
        return !!value;
    }

    function normalizeSeedValue(value, fallback = 101) {
        const parsed = parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function getWebAppIdStorageKey(templateId) {
        return `${TEMPLATE_WEB_APP_PREFIX}${templateId}`;
    }

    function getWebAppIdForTemplate(templateId) {
        const normalized = normalizeTemplateId(templateId);
        const perTemplateKey = getWebAppIdStorageKey(normalized);
        const perTemplateValue = localStorage.getItem(perTemplateKey);
        if (perTemplateValue) return perTemplateValue;

        if (normalized === "legacy") {
            const legacyValue = localStorage.getItem(LEGACY_WEB_APP_KEY);
            if (legacyValue) {
                localStorage.setItem(perTemplateKey, legacyValue);
                return legacyValue;
            }
        }

        return String(getTemplateDef(normalized).defaultWebAppId);
    }

    function setWebAppIdForTemplate(templateId, value) {
        const normalized = normalizeTemplateId(templateId);
        const perTemplateKey = getWebAppIdStorageKey(normalized);
        localStorage.setItem(perTemplateKey, value);

        if (normalized === "legacy") {
            localStorage.setItem(LEGACY_WEB_APP_KEY, value);
        }
    }

    function getParamsStorageKey(templateId) {
        return `${TEMPLATE_PARAMS_PREFIX}${normalizeTemplateId(templateId)}`;
    }

    function cloneParams(value) {
        return deepClone(value);
    }

    function getTemplateDefaultParams(templateId) {
        return cloneParams(getTemplateDef(templateId).defaultParams || {});
    }

    function loadTemplateParams(templateId) {
        const normalized = normalizeTemplateId(templateId);
        const defaults = getTemplateDefaultParams(normalized);
        const key = getParamsStorageKey(normalized);
        let raw = localStorage.getItem(key);

        if (!raw && normalized === "legacy") {
            const legacyRaw = localStorage.getItem("bizyair_params");
            if (legacyRaw) {
                localStorage.setItem(key, legacyRaw);
                raw = legacyRaw;
            }
        }

        if (!raw) return defaults;

        try {
            const parsed = JSON.parse(raw);
            return { ...defaults, ...parsed };
        } catch (e) {
            console.warn("读取模板参数失败，使用默认值:", e);
            return defaults;
        }
    }

    function saveTemplateParams(templateId, params) {
        const normalized = normalizeTemplateId(templateId);
        const key = getParamsStorageKey(normalized);
        const payload = JSON.stringify(params);
        localStorage.setItem(key, payload);

        if (normalized === "legacy") {
            localStorage.setItem("bizyair_params", payload);
        }
    }

    function applyParamsToUI(params) {
        const mapValue = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.value = value ?? "";
        };
        mapValue("bizyair-width", params.width);
        mapValue("bizyair-height", params.height);
        mapValue("bizyair-steps", params.steps);
        mapValue("bizyair-seed", params.seed);
        mapValue("bizyair-scale", params.scaleBy);
        mapValue("bizyair-cfg", params.cfg);
        mapValue("bizyair-sampler", params.sampler);
        mapValue("bizyair-pos-prompt", params.positivePrompt || "");
        mapValue("bizyair-neg-prompt", params.negativePrompt || "");
        mapValue("bizyair-scheduler", params.scheduler || "");
        mapValue("bizyair-denoise", params.denoise !== undefined ? params.denoise : "");
        mapValue("bizyair-aspect-ratio", params.aspectRatio || "");
        mapValue("bizyair-resolution", params.resolution || "");

        const randomSeedEl = document.getElementById("bizyair-random-seed");
        if (randomSeedEl) randomSeedEl.checked = normalizeRandomSeedValue(params.randomSeed);
    }

    function updateSeedControls(templateId, currentParams) {
        const supportsSeed = templateSupportsSeed(templateId);
        const seedInput = document.getElementById("bizyair-seed");
        const randomSeedEl = document.getElementById("bizyair-random-seed");
        const seedHint = document.getElementById("bizyair-seed-hint");

        if (seedInput) {
            seedInput.disabled = !supportsSeed;
            seedInput.style.opacity = supportsSeed ? "1" : "0.6";
        }

        if (randomSeedEl) {
            randomSeedEl.disabled = !supportsSeed;
            if (!supportsSeed) randomSeedEl.checked = false;
        }

        if (!supportsSeed && currentParams) {
            currentParams.randomSeed = false;
        }

        if (seedHint) {
            seedHint.textContent = supportsSeed ? "" : "当前模板不支持 Seed，随机种子不会生效";
        }
    }

    function buildTemplateOptionsHtml(selectedId) {
        const templates = getAllTemplates();
        const baseIds = Object.keys(BASE_TEMPLATES);
        const customIds = Object.keys(customTemplates).filter(id => !BASE_TEMPLATES[id]);
        const orderedIds = [...baseIds, ...customIds];
        return orderedIds.map(id => {
            const t = templates[id];
            const selected = id === selectedId ? "selected" : "";
            const label = t ? t.label : id;
            return `<option value="${id}" ${selected}>${label}</option>`;
        }).join("");
    }

    function refreshTemplateSelect() {
        const select = document.getElementById("bizyair-template");
        if (!select) return;
        select.innerHTML = buildTemplateOptionsHtml(bizyairTemplate);
    }

    function renderCustomTemplateList() {
        const container = document.getElementById("bizyair-custom-templates");
        if (!container) return;

        if (!customTemplateDefs || customTemplateDefs.length === 0) {
            container.innerHTML = `<div style="color:#777;font-size:12px;">暂无自定义模板</div>`;
            return;
        }

        const items = customTemplateDefs.map(def => {
            const label = escapeHtml(def.label || def.id || "未命名模板");
            const id = escapeHtml(def.id || "");
            const webAppId = escapeHtml(def.webAppId || def.web_app_id || "");
            return `
                <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 10px;background:#23232a;border-radius:6px;margin-bottom:8px;">
                    <div style="min-width:0;">
                        <div style="font-size:12px;color:#ddd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${label}</div>
                        <div style="font-size:11px;color:#777;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">ID: ${id} | web_app_id: ${webAppId}</div>
                    </div>
                    <button type="button" class="bizyair-btn" style="background:#ef4444;color:white;padding:6px 10px;font-size:12px;flex:0 0 auto;" onclick="window.deleteBizyairCustomTemplate('${id}')">删除</button>
                </div>
            `;
        }).join("");

        container.innerHTML = items;
    }

    function isNumericValue(value) {
        if (typeof value === "number") return Number.isFinite(value);
        if (typeof value === "string") {
            const trimmed = value.trim();
            if (!trimmed) return false;
            return Number.isFinite(Number(trimmed));
        }
        return false;
    }

    function detectPromptKeys(inputValues) {
        const entries = Object.entries(inputValues || {}).filter(([, value]) => typeof value === "string");
        if (entries.length === 0) return { positiveKey: null, negativeKey: null };

        const promptCandidates = entries.filter(([key]) => /(prompt|text|value)/i.test(key));
        const candidates = promptCandidates.length ? promptCandidates : entries;

        const negativeHints = [
            "blurry", "low quality", "worst quality", "watermark", "text", "logo", "jpeg", "ugly", "bad",
            "模糊", "低质量", "水印", "文字", "噪点", "低分辨率", "丑"
        ];

        let negativeKey = null;
        let bestScore = 0;

        for (const [key, value] of candidates) {
            const keyLower = key.toLowerCase();
            if (keyLower.includes("negative") || keyLower.includes("neg")) {
                negativeKey = key;
                bestScore = 999;
                break;
            }

            const valueLower = value.toLowerCase();
            let score = 0;
            negativeHints.forEach(hint => {
                if (valueLower.includes(hint)) score += 1;
            });

            if (score > bestScore) {
                bestScore = score;
                negativeKey = key;
            }
        }

        if (bestScore === 0) {
            negativeKey = null;
        }

        let positiveKey = candidates.find(([key]) => key !== negativeKey)?.[0] || candidates[0][0];
        if (positiveKey === negativeKey) negativeKey = null;

        return { positiveKey, negativeKey };
    }

    function detectParamKeys(inputValues) {
        const keys = Object.keys(inputValues || {});
        const map = {};

        const pickKey = (suffixes, requireNumeric) => {
            for (const key of keys) {
                const lower = key.toLowerCase();
                if (suffixes.some(suffix => lower.endsWith(suffix))) {
                    if (!requireNumeric || isNumericValue(inputValues[key])) {
                        return key;
                    }
                }
            }
            return null;
        };

        map.width = pickKey([".width", "custom_width", "_width", "width"], true);
        map.height = pickKey([".height", "custom_height", "_height", "height"], true);
        map.steps = pickKey([".steps", "_steps", "steps"], true);
        map.seed = pickKey([".seed", "_seed", "seed"], true);
        map.cfg = pickKey([".cfg", "_cfg", "cfg"], true);
        map.sampler = pickKey([".sampler_name", "sampler_name"], false);
        map.scheduler = pickKey([".scheduler", "scheduler"], false);
        map.denoise = pickKey([".denoise", "denoise"], true);
        map.scaleBy = pickKey([".scale_by", "scale_by", "scaleby", "scaleBy"], true);
        map.aspectRatio = pickKey([".aspect_ratio", "aspect_ratio"], false);
        map.resolution = pickKey([".resolution", "resolution"], false);

        if (!map.width || !map.height) {
            const valueKeys = keys.filter(key =>
                key.toLowerCase().endsWith(".value") && isNumericValue(inputValues[key])
            );
            const hasFlux = keys.some(key => key.toLowerCase().includes("flux"));
            if (hasFlux && valueKeys.length >= 2) {
                map.width = map.width || valueKeys[0];
                map.height = map.height || valueKeys[1];
            }
        }

        return Object.fromEntries(Object.entries(map).filter(([, value]) => value));
    }

    function buildDefaultParamsFromInput(inputValues, paramKeyMap, promptKeys) {
        const defaults = {
            positivePrompt: promptKeys.positiveKey && typeof inputValues[promptKeys.positiveKey] === "string"
                ? inputValues[promptKeys.positiveKey]
                : "",
            negativePrompt: promptKeys.negativeKey && typeof inputValues[promptKeys.negativeKey] === "string"
                ? inputValues[promptKeys.negativeKey]
                : "",
            width: 832,
            height: 1216,
            steps: 20,
            seed: 101,
            cfg: 7,
            sampler: "euler",
            scaleBy: 1,
            randomSeed: true,
            scheduler: "simple",
            denoise: 1,
            aspectRatio: "",
            resolution: ""
        };

        const assignNumber = (field, key) => {
            if (!key) return;
            const value = inputValues[key];
            if (isNumericValue(value)) {
                defaults[field] = Number(value);
            }
        };

        assignNumber("width", paramKeyMap.width);
        assignNumber("height", paramKeyMap.height);
        assignNumber("steps", paramKeyMap.steps);
        assignNumber("seed", paramKeyMap.seed);
        assignNumber("cfg", paramKeyMap.cfg);
        assignNumber("scaleBy", paramKeyMap.scaleBy);
        assignNumber("denoise", paramKeyMap.denoise);

        if (paramKeyMap.sampler && inputValues[paramKeyMap.sampler]) {
            defaults.sampler = inputValues[paramKeyMap.sampler];
        }
        if (paramKeyMap.scheduler && inputValues[paramKeyMap.scheduler]) {
            defaults.scheduler = inputValues[paramKeyMap.scheduler];
        }
        if (paramKeyMap.aspectRatio && inputValues[paramKeyMap.aspectRatio]) {
            defaults.aspectRatio = inputValues[paramKeyMap.aspectRatio];
        }
        if (paramKeyMap.resolution && inputValues[paramKeyMap.resolution]) {
            defaults.resolution = inputValues[paramKeyMap.resolution];
        }

        return defaults;
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function findMatchingBrace(text, startIndex) {
        let depth = 0;
        let inString = false;
        let stringChar = "";
        let escape = false;

        for (let i = startIndex; i < text.length; i++) {
            const ch = text[i];

            if (inString) {
                if (escape) {
                    escape = false;
                } else if (ch === "\\") {
                    escape = true;
                } else if (ch === stringChar) {
                    inString = false;
                    stringChar = "";
                }
                continue;
            }

            if (ch === "\"" || ch === "'") {
                inString = true;
                stringChar = ch;
                continue;
            }

            if (ch === "{") depth += 1;
            if (ch === "}") {
                depth -= 1;
                if (depth === 0) return i;
            }
        }

        return -1;
    }

    function sanitizeJsonText(text) {
        return text.replace(/,(\s*[}\]])/g, "$1");
    }

    function tryParseJson(text) {
        if (!text) return null;
        const trimmed = text.trim();
        try {
            return JSON.parse(trimmed);
        } catch (_) {}

        try {
            return JSON.parse(sanitizeJsonText(trimmed));
        } catch (_) {
            return null;
        }
    }

    function extractJsonObjects(rawText) {
        const results = [];
        const marker = "JSON.stringify";
        let index = 0;

        while ((index = rawText.indexOf(marker, index)) !== -1) {
            const braceStart = rawText.indexOf("{", index);
            if (braceStart === -1) break;
            const braceEnd = findMatchingBrace(rawText, braceStart);
            if (braceEnd === -1) break;

            const jsonText = rawText.slice(braceStart, braceEnd + 1);
            const parsed = tryParseJson(jsonText);
            if (parsed) results.push(parsed);

            index = braceEnd + 1;
        }

        if (results.length === 0) {
            const parsed = tryParseJson(rawText);
            if (parsed) results.push(parsed);
        }

        return results;
    }

    function buildCustomTemplateDef(payload, label, index, total, positiveKeyOverride, negativeKeyOverride) {
        if (!payload || !payload.web_app_id || !payload.input_values) return null;

        const inputValues = payload.input_values;
        const promptKeys = detectPromptKeys(inputValues);
        const effectivePositiveKey = positiveKeyOverride || promptKeys.positiveKey;
        const effectiveNegativeKey = negativeKeyOverride || promptKeys.negativeKey;
        if (!effectivePositiveKey) return null;

        const paramKeyMap = detectParamKeys(inputValues);
        const defaultParams = buildDefaultParamsFromInput(inputValues, paramKeyMap, {
            positiveKey: effectivePositiveKey,
            negativeKey: effectiveNegativeKey
        });
        const safeLabel = label
            ? (total > 1 ? `${label} ${index + 1}` : label)
            : `自定义模板 ${payload.web_app_id}`;
        const id = `custom_${payload.web_app_id}_${Date.now()}_${index}`;

        const parsedWebAppId = parseInt(payload.web_app_id, 10);
        const webAppId = Number.isFinite(parsedWebAppId) ? parsedWebAppId : payload.web_app_id;

        return {
            id,
            label: safeLabel,
            webAppId,
            outputIndexFromEnd: 1,
            positivePromptKey: effectivePositiveKey,
            negativePromptKey: effectiveNegativeKey || null,
            baseInput: deepClone(inputValues),
            paramKeyMap,
            defaultParams,
            suppressPreviewOutput: true
        };
    }

    let pendingImportPayloads = [];
    let pendingImportLabel = "";

    function buildImportReview(payloads, label) {
        const reviewEl = document.getElementById("bizyair-import-review");
        if (!reviewEl) return;

        const items = payloads.map((payload, idx) => {
            const inputValues = payload.input_values || {};
            const stringEntries = Object.entries(inputValues)
                .filter(([, value]) => typeof value === "string")
                .map(([key, value]) => ({
                    key,
                    value
                }));

            const promptKeys = detectPromptKeys(inputValues);
            const positiveKey = promptKeys.positiveKey || "";
            const negativeKey = promptKeys.negativeKey || "";

            const options = stringEntries.length === 0
                ? `<option value="">(无可选字段)</option>`
                : stringEntries.map(({ key, value }) => {
                    const preview = value.length > 80 ? value.slice(0, 80) + "..." : value;
                    return `<option value="${escapeHtml(key)}">${escapeHtml(key)} | ${escapeHtml(preview)}</option>`;
                }).join("");

            const allEntries = Object.entries(inputValues || {});
            const nodeList = allEntries.map(([key, value]) => {
                const raw = typeof value === "string" ? value : JSON.stringify(value);
                const preview = raw.length > 120 ? raw.slice(0, 120) + "..." : raw;
                return `<div style="font-size:11px;color:#777;word-break:break-all;"><span style="color:#9aa4b2;">${escapeHtml(key)}</span> = ${escapeHtml(preview)}</div>`;
            }).join("") || `<div style="font-size:11px;color:#777;">未找到可用的节点</div>`;

            return `
                <div style="margin-bottom:12px;padding:10px;background:#23232a;border-radius:6px;">
                    <div style="font-size:12px;color:#aaa;margin-bottom:8px;">模板 ${idx + 1} | web_app_id: ${escapeHtml(payload.web_app_id)}</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
                        <div>
                            <label style="color:#aaa;font-size:11px;">正面提示词字段</label>
                            <select id="bizyair-import-pos-${idx}" class="bizyair-input">
                                ${options}
                            </select>
                        </div>
                        <div>
                            <label style="color:#aaa;font-size:11px;">负面提示词字段（可选）</label>
                            <select id="bizyair-import-neg-${idx}" class="bizyair-input">
                                <option value="">(无)</option>
                                ${options}
                            </select>
                        </div>
                    </div>
                    <details>
                        <summary style="cursor:pointer;color:#888;font-size:11px;">查看所有文本节点</summary>
                        <div style="margin-top:6px;">${nodeList}</div>
                    </details>
                </div>
            `;
        }).join("");

        reviewEl.innerHTML = items || `<div style="color:#777;font-size:12px;">未识别到可用模板。</div>`;

        payloads.forEach((payload, idx) => {
            const inputValues = payload.input_values || {};
            const promptKeys = detectPromptKeys(inputValues);
            const posSelect = document.getElementById(`bizyair-import-pos-${idx}`);
            const negSelect = document.getElementById(`bizyair-import-neg-${idx}`);
            if (posSelect && promptKeys.positiveKey) posSelect.value = promptKeys.positiveKey;
            if (negSelect && promptKeys.negativeKey) negSelect.value = promptKeys.negativeKey;
        });
    }

    window.parseBizyairTemplate = function() {
        const labelInput = document.getElementById("bizyair-import-label");
        const rawInput = document.getElementById("bizyair-import-raw");
        const hint = document.getElementById("bizyair-import-hint");
        const confirmBtn = document.getElementById("bizyair-import-confirm");
        const reviewEl = document.getElementById("bizyair-import-review");
        const label = labelInput ? labelInput.value.trim() : "";
        const rawText = rawInput ? rawInput.value : "";

        if (!label) {
            showToast("请先填写模板名称");
            return;
        }
        if (!rawText || !rawText.trim()) {
            showToast("请先粘贴模板文本");
            return;
        }

        const payloads = extractJsonObjects(rawText);
        if (payloads.length === 0) {
            showToast("未识别到可用的模板内容");
            return;
        }

        payloads.forEach(payload => {
            if (payload && Object.prototype.hasOwnProperty.call(payload, "suppress_preview_output")) {
                payload.suppress_preview_output = true;
            }
        });

        pendingImportPayloads = payloads;
        pendingImportLabel = label;

        buildImportReview(payloads, label);
        if (hint) {
            hint.textContent = `已解析 ${payloads.length} 个模板，请选择正负面字段后确认导入`;
        }
        if (confirmBtn) confirmBtn.disabled = false;
        showToast(`✅ 已解析 ${payloads.length} 个模板`);
    };

    window.confirmBizyairImport = function() {
        const hint = document.getElementById("bizyair-import-hint");
        if (!pendingImportPayloads || pendingImportPayloads.length === 0) {
            showToast("请先解析模板");
            return;
        }

        const newDefs = [];
        for (let idx = 0; idx < pendingImportPayloads.length; idx++) {
            const payload = pendingImportPayloads[idx];
            const posSelect = document.getElementById(`bizyair-import-pos-${idx}`);
            const negSelect = document.getElementById(`bizyair-import-neg-${idx}`);
            const positiveKey = posSelect ? posSelect.value : "";
            const negativeKey = negSelect ? negSelect.value : "";

            if (!positiveKey) {
                showToast(`模板 ${idx + 1} 未选择正面提示词字段`);
                return;
            }

            const def = buildCustomTemplateDef(payload, pendingImportLabel, idx, pendingImportPayloads.length, positiveKey, negativeKey || null);
            if (def) newDefs.push(def);
        }

        if (newDefs.length === 0) {
            showToast("模板导入失败");
            return;
        }

        const updatedDefs = [...customTemplateDefs, ...newDefs];
        saveCustomTemplateDefs(updatedDefs);
        refreshCustomTemplates();
        refreshTemplateSelect();
        renderCustomTemplateList();

        pendingImportPayloads = [];
        pendingImportLabel = "";
        if (confirmBtn) confirmBtn.disabled = true;
        if (reviewEl) reviewEl.innerHTML = "";

        if (hint) {
            hint.textContent = `已导入 ${newDefs.length} 个模板`;
        }

        showToast(`✅ 已导入 ${newDefs.length} 个模板`);
        window.switchBizyairTemplate(newDefs[0].id);
    };

    let slotSelection = loadSlotSelection();
    let bizyairTemplate = normalizeTemplateId(localStorage.getItem("bizyair_template"));
    let bizyairApiKey = localStorage.getItem("bizyair_api_key") || "";
    let bizyairWebAppId = getWebAppIdForTemplate(bizyairTemplate);
    let autoGenEnabled = localStorage.getItem("bizyair_auto_gen") === "true";
    let queueLimitEnabled = localStorage.getItem("bizyair_queue_limit") === "true";
    let autoTagEnabled = localStorage.getItem(BIZYAIR_AUTO_TAG_KEY) === "true";
    let autoTagAfterMessageEnabled = localStorage.getItem(BIZYAIR_AUTO_TAG_AFTER_MESSAGE_KEY) === "true";
    let contextRegexRules = localStorage.getItem(BIZYAIR_CONTEXT_REGEX_KEY) || "";
    let capturedContext = localStorage.getItem(BIZYAIR_CONTEXT_KEY) || "";
    let llmSettings = {
        url: localStorage.getItem(BIZYAIR_LLM_URL_KEY) || "https://api.openai.com/v1",
        key: localStorage.getItem(BIZYAIR_LLM_KEY_KEY) || "",
        model: localStorage.getItem(BIZYAIR_LLM_MODEL_KEY) || "gpt-4o-mini"
    };
    let promptPresets = {
        jailbreak: ensureExclusivePresetState("jailbreak", loadPromptPresetList("jailbreak")),
        task: ensureExclusivePresetState("task", loadPromptPresetList("task")),
        char: loadPromptPresetList("char")
    };
    const presetEditorSelection = {
        jailbreak: null,
        task: null,
        char: null
    };
    let tempLocators = {};
    let messageObserver = null;
    let scanHeartbeatTimer = null;
    let restoreObserver = null;
    let autoTagListenerBound = false;
    let autoTagInFlight = false;
    let autoTagPendingMessageId = null;
    const autoTagProcessedMessageIds = new Set();
    let llmAbortController = null;
    let llmInFlightLabel = "";
    let restoreTimer = null;
    let galleryData = [];
    const generatingSlots = new Set();
    const slotAbortControllers = new Map();
    const autoGenScheduledSlots = new Set();
    const autoGenTriggeredSlots = new Set();
    const queuedGenerationSlots = new Set();
    const pendingGenerationQueue = [];
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    let pendingCharacterBuild = null;
    const MAX_BACKGROUND_QUEUE_ACTIVE = 2;
    const QUEUE_DISPATCH_INTERVAL_MS = 1000;
    let bizyairApiKeys = [];
    const bizyairKeyPoolState = new Map();
    const slotAssignedApiKeys = new Map();
    let queueDispatchTimer = null;
    let nextQueueDispatchAt = 0;
    let scheduledQueueDispatch = null;
    let bizyairCreateDispatchChain = Promise.resolve();
    let nextBizyairCreateAt = 0;

    let imageParams = loadTemplateParams(bizyairTemplate);

    function parseBizyairApiKeys(raw) {
        return Array.from(new Set(
            String(raw || "")
                .replace(/[\r\n，;；]+/g, ",")
                .split(",")
                .map(item => item.trim())
                .filter(Boolean)
        ));
    }

    function syncBizyairKeyPool() {
        bizyairApiKeys = parseBizyairApiKeys(bizyairApiKey);

        const existingKeys = new Set(bizyairApiKeys);
        Array.from(bizyairKeyPoolState.keys()).forEach(key => {
            if (!existingKeys.has(key)) {
                bizyairKeyPoolState.delete(key);
            }
        });

        bizyairApiKeys.forEach(key => {
            if (!bizyairKeyPoolState.has(key)) {
                bizyairKeyPoolState.set(key, {
                    key,
                    inflightCount: 0,
                    cooldownUntil: 0,
                    lastAssignedAt: 0,
                    failureCount: 0
                });
            }
        });
    }

    function hasMultipleBizyairKeys() {
        return bizyairApiKeys.length > 1;
    }

    function shouldUseSingleKeyQueueLimit() {
        return queueLimitEnabled && bizyairApiKeys.length <= 1;
    }

    function getBizyairKeyState(key) {
        if (!key) return null;
        if (!bizyairKeyPoolState.has(key)) {
            bizyairKeyPoolState.set(key, {
                key,
                inflightCount: 0,
                cooldownUntil: 0,
                lastAssignedAt: 0,
                failureCount: 0
            });
        }
        return bizyairKeyPoolState.get(key);
    }

    function acquireBizyairApiKeySlot() {
        const now = Date.now();
        const candidates = bizyairApiKeys
            .map(key => getBizyairKeyState(key))
            .filter(state => state && state.cooldownUntil <= now && state.inflightCount < MAX_BACKGROUND_QUEUE_ACTIVE)
            .sort((a, b) => {
                if (a.inflightCount !== b.inflightCount) return a.inflightCount - b.inflightCount;
                return a.lastAssignedAt - b.lastAssignedAt;
            });

        const selected = candidates[0] || null;
        if (!selected) return null;

        selected.inflightCount += 1;
        selected.lastAssignedAt = now;
        return selected.key;
    }

    function releaseBizyairApiKeySlot(key) {
        const state = getBizyairKeyState(key);
        if (!state) return;
        state.inflightCount = Math.max(0, state.inflightCount - 1);
    }

    function cooldownBizyairApiKey(key, ms = 12000) {
        const state = getBizyairKeyState(key);
        if (!state) return;
        state.cooldownUntil = Date.now() + ms;
    }

    function getBizyairApiKeyBackoffMs(failureCount) {
        if (failureCount <= 1) return 60 * 1000;
        if (failureCount === 2) return 5 * 60 * 1000;
        return (failureCount * 5) * 60 * 1000;
    }

    function markBizyairApiKeyFailure(key) {
        const state = getBizyairKeyState(key);
        if (!state) return;
        state.failureCount = (state.failureCount || 0) + 1;
        state.cooldownUntil = Date.now() + getBizyairApiKeyBackoffMs(state.failureCount);
    }

    function markBizyairApiKeySuccess(key) {
        const state = getBizyairKeyState(key);
        if (!state) return;
        state.failureCount = 0;
        state.cooldownUntil = 0;
    }

    syncBizyairKeyPool();

    function injectStyles() {
        const styleId = "bizyair-plugin-style";
        if (document.getElementById(styleId)) return;
        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = `
            /* ===== Design Tokens ===== */
            :root {
                --bz-bg-overlay: rgba(0,0,0,0.65);
                --bz-bg-modal: #161618;
                --bz-bg-card: #1e1e22;
                --bz-bg-input: #26262b;
                --bz-bg-hover: #2e2e34;
                --bz-border: #333338;
                --bz-border-focus: #8b5cf6;
                --bz-accent: #8b5cf6;
                --bz-accent-light: #a78bfa;
                --bz-accent-glow: rgba(139,92,246,0.15);
                --bz-danger: #ef4444;
                --bz-success: #10b981;
                --bz-warning: #f59e0b;
                --bz-info: #38bdf8;
                --bz-text: #e2e2e8;
                --bz-text-muted: #9898a4;
                --bz-text-dim: #6b6b78;
                --bz-radius-sm: 6px;
                --bz-radius-md: 10px;
                --bz-radius-lg: 14px;
                --bz-radius-pill: 20px;
                --bz-font: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
                --bz-transition: 0.2s ease;
            }

            /* ===== Toast ===== */
            #bizyair-toast {
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%) translateY(-8px);
                background: var(--bz-bg-card);
                color: var(--bz-text);
                border: 1px solid var(--bz-border);
                padding: 10px 22px;
                border-radius: var(--bz-radius-pill);
                font-size: 13px;
                font-weight: 600;
                z-index: 10000000;
                box-shadow: 0 8px 32px rgba(0,0,0,0.4);
                opacity: 0;
                transition: opacity 0.3s, transform 0.3s;
                pointer-events: none;
                max-width: calc(100vw - 40px);
                text-align: center;
            }
            #bizyair-toast.show {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }

            /* ===== Settings Modal Overlay ===== */
            #bizyair-settings-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                max-width: 100%;
                max-height: 100%;
                margin: 0;
                padding: 16px;
                border: none;
                z-index: 99999;
                background: transparent;
                font-family: var(--bz-font);
                box-sizing: border-box;
                overflow: hidden;
            }
            #bizyair-settings-modal:not([open]) {
                display: none;
            }
            #bizyair-settings-modal[open] {
                display: flex;
                align-items: center;
                justify-content: center;
            }
            #bizyair-settings-modal::backdrop {
                background: var(--bz-bg-overlay);
            }

            /* ===== Modal Shell ===== */
            .bizyair-modal-shell {
                width: min(560px, calc(100vw - 32px));
                max-width: 560px;
                max-height: min(92vh, 860px);
                background: var(--bz-bg-modal);
                border: 1px solid var(--bz-border);
                border-radius: var(--bz-radius-lg);
                box-shadow: 0 24px 80px rgba(0,0,0,0.5);
                overflow: hidden;
                display: flex;
                flex-direction: column;
                color: var(--bz-text);
                font-family: var(--bz-font);
            }
            #bizyair-settings-modal .bizyair-modal-shell {
                width: min(960px, calc(100vw - 48px));
                max-width: 960px;
                height: min(88vh, 860px);
                max-height: min(88vh, 860px);
            }

            /* ===== Modal Header ===== */
            .bizyair-modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px 18px;
                border-bottom: 1px solid var(--bz-border);
                flex-shrink: 0;
            }
            .bizyair-modal-header .bizyair-title {
                font-size: 16px;
                font-weight: 700;
                color: var(--bz-text);
            }
            .bizyair-modal-close {
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: var(--bz-radius-sm);
                background: none;
                border: none;
                color: var(--bz-text-muted);
                font-size: 20px;
                cursor: pointer;
                transition: background var(--bz-transition), color var(--bz-transition);
            }
            .bizyair-modal-close:hover {
                background: var(--bz-bg-hover);
                color: var(--bz-text);
            }

            /* ===== Tabs ===== */
            .bizyair-tabs {
                display: flex;
                background: var(--bz-bg-card);
                border-bottom: 1px solid var(--bz-border);
                flex-shrink: 0;
            }
            .bizyair-tab {
                flex: 1;
                text-align: center;
                padding: 12px 8px;
                cursor: pointer;
                color: var(--bz-text-muted);
                font-size: 13px;
                font-weight: 600;
                border-bottom: 2px solid transparent;
                transition: color var(--bz-transition), border-color var(--bz-transition), background var(--bz-transition);
                user-select: none;
            }
            .bizyair-tab:hover {
                color: var(--bz-text);
                background: var(--bz-bg-hover);
            }
            .bizyair-tab.active {
                color: var(--bz-accent);
                border-bottom-color: var(--bz-accent);
            }

            /* ===== View Scroll Area ===== */
            .bizyair-view-scroll {
                flex: 1 1 0;
                min-height: 0;
                padding: 16px;
                overflow-y: auto;
                overscroll-behavior: contain;
                box-sizing: border-box;
                -webkit-overflow-scrolling: touch;
            }
            .bizyair-view-end-spacer {
                height: 24px;
                flex: 0 0 auto;
            }

            /* ===== Panel Card ===== */
            .bizyair-panel-card {
                background: var(--bz-bg-card);
                border: 1px solid var(--bz-border);
                border-radius: var(--bz-radius-md);
                padding: 14px;
                margin-bottom: 14px;
            }
            .bizyair-panel-card-title {
                font-size: 13px;
                font-weight: 700;
                color: var(--bz-accent-light);
                margin-bottom: 12px;
            }
            .bizyair-panel-card-subtitle {
                font-size: 11px;
                color: var(--bz-text-dim);
                margin-top: 2px;
            }

            /* ===== Form Elements ===== */
            .bizyair-compact-label {
                display: block;
                margin-bottom: 4px;
                color: var(--bz-text-muted);
                font-size: 12px;
                font-weight: 500;
            }
            .bizyair-input {
                width: 100%;
                background: var(--bz-bg-input);
                border: 1px solid var(--bz-border);
                color: var(--bz-text);
                padding: 9px 11px;
                border-radius: var(--bz-radius-sm);
                margin-bottom: 12px;
                box-sizing: border-box;
                font-size: 13px;
                font-family: var(--bz-font);
                transition: border-color var(--bz-transition);
                outline: none;
            }
            .bizyair-input:focus {
                border-color: var(--bz-border-focus);
            }
            .bizyair-input::placeholder {
                color: var(--bz-text-dim);
            }
            textarea.bizyair-input {
                resize: vertical;
                line-height: 1.5;
            }
            select.bizyair-input {
                cursor: pointer;
                appearance: auto;
            }

            /* ===== Checkbox Row ===== */
            .bizyair-check-row {
                display: flex;
                align-items: center;
                gap: 10px;
                cursor: pointer;
                padding: 6px 0;
            }
            .bizyair-check-row input[type="checkbox"] {
                accent-color: var(--bz-accent);
                width: 16px;
                height: 16px;
                flex-shrink: 0;
            }
            .bizyair-check-row span {
                color: var(--bz-text);
                font-size: 13px;
                line-height: 1.4;
            }

            /* ===== Buttons ===== */
            .bizyair-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 8px 16px;
                border: none;
                border-radius: var(--bz-radius-sm);
                cursor: pointer;
                font-weight: 600;
                font-size: 13px;
                font-family: var(--bz-font);
                white-space: nowrap;
                transition: opacity var(--bz-transition), transform var(--bz-transition), background var(--bz-transition);
            }
            .bizyair-btn:hover {
                opacity: 0.88;
            }
            .bizyair-btn:active {
                transform: scale(0.97);
            }
            .bizyair-btn-primary {
                background: var(--bz-accent);
                color: white;
            }
            .bizyair-btn-secondary {
                background: var(--bz-bg-hover);
                color: var(--bz-text-muted);
            }
            .bizyair-btn-danger {
                background: var(--bz-danger);
                color: white;
            }
            .bizyair-btn-success {
                background: var(--bz-success);
                color: white;
            }
            .bizyair-btn-full {
                width: 100%;
            }
            .bizyair-btn-sm {
                padding: 5px 10px;
                font-size: 11px;
            }

            /* ===== Layout Helpers ===== */
            .bizyair-stack {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .bizyair-row {
                display: flex;
                gap: 10px;
                align-items: center;
                flex-wrap: wrap;
            }
            .bizyair-actions {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
            }
            .bizyair-two-col {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 10px;
            }
            .bizyair-field {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }
            .bizyair-field .bizyair-input {
                margin-bottom: 0;
            }
            .bizyair-hint {
                font-size: 11px;
                color: var(--bz-text-dim);
                line-height: 1.5;
                margin-top: 4px;
            }

            /* ===== Section Title ===== */
            .bizyair-section-title {
                font-size: 13px;
                font-weight: 700;
                color: var(--bz-accent-light);
                margin: 18px 0 10px;
            }

            /* ===== Chat Inject Button ===== */
            .bizyair-inject-btn {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                background: linear-gradient(135deg, #7c3aed, #a855f7);
                color: white;
                border: none;
                padding: 4px 12px;
                border-radius: var(--bz-radius-pill);
                font-size: 12px;
                font-weight: bold;
                cursor: pointer;
                margin-left: 8px;
                vertical-align: middle;
                transition: transform var(--bz-transition), opacity var(--bz-transition);
            }
            .bizyair-inject-btn:hover {
                transform: scale(1.05);
                opacity: 0.9;
            }
            .bizyair-inject-btn.loading {
                background: var(--bz-danger);
                cursor: pointer;
                animation: bizyair-pulse 1.5s infinite;
            }
            @keyframes bizyair-pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.7; }
            }

            /* ===== Result Image ===== */
            .bizyair-result-img {
                max-width: 300px;
                max-height: 300px;
                border-radius: var(--bz-radius-md);
                border: 2px solid var(--bz-accent);
                box-shadow: 0 4px 20px rgba(0,0,0,0.4);
                display: block;
                margin-top: 8px;
                cursor: pointer;
                animation: bizyair-fade-in 0.4s ease;
            }
            .bizyair-result-img:hover {
                filter: brightness(1.1);
                border-color: var(--bz-accent-light);
            }
            @keyframes bizyair-fade-in {
                from { opacity: 0; transform: translateY(8px); }
                to { opacity: 1; transform: translateY(0); }
            }

            /* ===== Gallery Grid ===== */
            #bizyair-gallery-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
                gap: 10px;
            }
            .bizyair-gallery-item {
                position: relative;
                aspect-ratio: 1;
                background: #000;
                border-radius: var(--bz-radius-sm);
                overflow: hidden;
                cursor: pointer;
                border: 2px solid transparent;
                transition: border-color var(--bz-transition);
            }
            .bizyair-gallery-item:hover {
                border-color: var(--bz-accent);
            }
            .bizyair-gallery-item.selected {
                border-color: var(--bz-accent);
            }
            .bizyair-gallery-item img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }

            /* ===== Preset Item ===== */
            .bizyair-preset-item {
                display: flex;
                gap: 8px;
                align-items: flex-start;
                padding: 10px;
                border-radius: var(--bz-radius-sm);
                border: 1px solid var(--bz-border);
                background: var(--bz-bg-input);
                margin-top: 8px;
                transition: border-color var(--bz-transition);
                cursor: pointer;
            }
            .bizyair-preset-item:hover {
                border-color: var(--bz-accent);
            }
            .bizyair-preset-item.active {
                border-color: var(--bz-accent);
                background: var(--bz-accent-glow);
            }
            .bizyair-preset-item.editing {
                box-shadow: 0 0 0 1px var(--bz-info) inset;
            }

            /* ===== Tag Output Scene Card ===== */
            .bizyair-scene-card {
                background: var(--bz-bg-input);
                border: 1px solid var(--bz-border);
                border-radius: var(--bz-radius-sm);
                padding: 12px;
                margin-bottom: 10px;
            }

            /* ===== Overlay (for dynamic popup dialogs) ===== */
            .bizyair-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                max-width: 100%;
                max-height: 100%;
                margin: 0;
                padding: 16px;
                border: none;
                background: transparent;
                box-sizing: border-box;
                overflow: hidden;
            }
            .bizyair-overlay:not([open]) {
                display: none;
            }
            .bizyair-overlay[open] {
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .bizyair-overlay::backdrop {
                background: var(--bz-bg-overlay);
            }
            .bizyair-overlay.bizyair-overlay-top::backdrop {
                background: rgba(0,0,0,0.72);
            }

            /* ===== Row that stays horizontal on mobile ===== */
            .bizyair-row-inline {
                display: flex;
                gap: 8px;
                align-items: center;
                flex-wrap: nowrap;
            }

            /* ===== Image Viewer Overlay ===== */
            #bizyair-gallery {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                max-width: 100%;
                max-height: 100%;
                margin: 0;
                padding: 0;
                border: none;
                background: rgba(0,0,0,0.95);
                cursor: pointer;
                box-sizing: border-box;
            }
            #bizyair-gallery:not([open]) {
                display: none;
            }
            #bizyair-gallery[open] {
                display: flex;
                align-items: center;
                justify-content: center;
            }
            #bizyair-gallery::backdrop {
                background: transparent;
            }

            /* ===== Global box-sizing ===== */
            [class^="bizyair-"],
            [class*=" bizyair-"],
            [id^="bizyair-"] {
                box-sizing: border-box;
            }

            /* ===== Responsive: Mobile ===== */
            @media screen and (max-width: 640px) {
                /* Settings modal: dialog fills screen */
                #bizyair-settings-modal {
                    padding: 0;
                }
                #bizyair-settings-modal .bizyair-modal-shell {
                    width: 100% !important;
                    height: 100% !important;
                    max-width: none !important;
                    max-height: none !important;
                    border-radius: 0 !important;
                    border: none !important;
                    box-shadow: none !important;
                    margin: 0 !important;
                }
                .bizyair-view-scroll {
                    padding: 12px !important;
                    padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 32px) !important;
                }
                .bizyair-tab {
                    padding: 14px 6px;
                    font-size: 13px;
                }
                .bizyair-two-col {
                    grid-template-columns: 1fr;
                }
                .bizyair-row {
                    flex-direction: column;
                    align-items: stretch;
                }
                .bizyair-actions {
                    flex-direction: row;
                    flex-wrap: wrap;
                }
                .bizyair-actions .bizyair-btn {
                    flex: 1 1 auto;
                    min-width: 0;
                }
                .bizyair-row-inline {
                    flex-direction: row !important;
                    flex-wrap: nowrap !important;
                }
                .bizyair-input,
                select.bizyair-input {
                    font-size: 16px;
                    padding: 12px 11px;
                }
                .bizyair-result-img {
                    max-width: min(100%, 280px);
                    max-height: 260px;
                }
                #bizyair-gallery-grid {
                    grid-template-columns: repeat(2, 1fr);
                    gap: 8px;
                }
                /* Dynamic popup overlays on mobile: bottom sheet */
                .bizyair-overlay {
                    padding: 0;
                    align-items: flex-end;
                }
                .bizyair-overlay .bizyair-modal-shell {
                    width: 100% !important;
                    max-width: none !important;
                    height: auto !important;
                    max-height: 85% !important;
                    border-radius: var(--bz-radius-lg) var(--bz-radius-lg) 0 0 !important;
                    border: none !important;
                    box-shadow: none !important;
                    margin: 0 !important;
                    overflow-y: auto !important;
                    padding-bottom: env(safe-area-inset-bottom, 0px);
                }
                /* Preset item buttons */
                .bizyair-preset-item {
                    flex-direction: column;
                }
                .bizyair-preset-item > div:last-child {
                    align-self: flex-start;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function createToast() {
        if (document.getElementById("bizyair-toast")) return;
        const t = document.createElement("div");
        t.id = "bizyair-toast";
        document.body.appendChild(t);
    }

    function showToast(msg) {
        const t = document.getElementById("bizyair-toast");
        if (t) {
            t.innerText = msg;
            t.classList.add("show");
            setTimeout(() => t.classList.remove("show"), 2500);
        }
    }

    function savePromptPresets(type) {
        try {
            localStorage.setItem(`${BIZYAIR_PRESET_PREFIX}${type}`, JSON.stringify(promptPresets[type] || []));
        } catch (e) {
            console.error(`保存 ${type} 预设失败:`, e);
        }
    }

    function normalizeImportedPresetList(list, type) {
        if (!Array.isArray(list)) return [];
        return list.map((item, index) => ({
            id: item.id || Date.now() + index,
            name: item.name || `导入预设 ${index + 1}`,
            content: item.content || "",
            active: !!item.active,
            history: Array.isArray(item.history) ? item.history : (type === "char" ? [] : [])
        }));
    }

    function mergeImportedPromptPresets(imported) {
        ["jailbreak", "task", "char"].forEach(type => {
            mergePromptPresetType(type, imported?.[type]);
        });
        renderAllPromptPresetLists();
        updateSystemPromptPreview();
    }

    function getFullSystemPrompt() {
        const jailbreak = promptPresets.jailbreak.find(item => item.active)?.content || "";
        const task = promptPresets.task.find(item => item.active)?.content || "";
        const chars = promptPresets.char.filter(item => item.active).map(item => item.content).join("\n\n");
        return [jailbreak, task, chars].filter(Boolean).join("\n\n---\n\n");
    }

    function getTaskPresetContentByName(name) {
        const exact = (promptPresets.task || []).find(item => item.name === name);
        return exact?.content || "";
    }

    function getPresetContentByApproxName(type, targetName) {
        const normalizedTarget = String(targetName || "").trim().toLowerCase();
        if (!normalizedTarget) return "";
        const list = promptPresets[type] || [];
        const exact = list.find(item => String(item.name || "").trim().toLowerCase() === normalizedTarget);
        if (exact?.content) return exact.content;
        const fuzzy = list.find(item => String(item.name || "").trim().toLowerCase().includes(normalizedTarget));
        return fuzzy?.content || "";
    }

    function getPromptPresetById(type, id) {
        return (promptPresets[type] || []).find(entry => entry.id === id) || null;
    }

    function getPromptPresetEditorElements(type) {
        return {
            nameEl: document.getElementById(`bizyair-inp-${type}-name`),
            contentEl: document.getElementById(`bizyair-inp-${type}-content`),
            statusEl: document.getElementById(`bizyair-preset-status-${type}`)
        };
    }

    function setPromptPresetEditorStatus(type, message, color = "#777") {
        const { statusEl } = getPromptPresetEditorElements(type);
        if (!statusEl) return;
        statusEl.textContent = message || "";
        statusEl.style.color = color;
    }

    function updatePromptPresetEditorState(type) {
        const selected = getPromptPresetById(type, presetEditorSelection[type]);
        if (selected) {
            const historyCount = Array.isArray(selected.history) ? selected.history.length : 0;
            setPromptPresetEditorStatus(
                type,
                `当前正在编辑：${selected.name}${historyCount > 0 ? ` | 历史版本 ${historyCount}` : ""}`,
                "#a78bfa"
            );
            return;
        }
        setPromptPresetEditorStatus(type, "当前为新建模式", "#777");
    }

    function clearPromptPresetEditor(type) {
        const { nameEl, contentEl } = getPromptPresetEditorElements(type);
        if (nameEl) nameEl.value = "";
        if (contentEl) contentEl.value = "";
        presetEditorSelection[type] = null;
        updatePromptPresetEditorState(type);
    }

    function snapshotPromptPresetHistory(item) {
        return {
            name: item.name || "",
            content: item.content || "",
            active: !!item.active,
            savedAt: new Date().toISOString()
        };
    }

    function pushPromptPresetHistory(item) {
        if (!item) return;
        if (!Array.isArray(item.history)) item.history = [];
        if (String(item.content || "").trim() || String(item.name || "").trim()) {
            item.history.unshift(snapshotPromptPresetHistory(item));
            item.history = item.history.slice(0, 20);
        }
    }

    function buildUniquePromptPresetName(type, rawName, ignoreId = null) {
        const baseName = String(rawName || "").trim() || "未命名预设";
        const normalized = value => String(value || "").trim().toLowerCase();
        const existingNames = new Set(
            (promptPresets[type] || [])
                .filter(item => item && item.id !== ignoreId)
                .map(item => normalized(item.name))
        );
        if (!existingNames.has(normalized(baseName))) {
            return baseName;
        }
        let index = 2;
        let nextName = `${baseName} ${index}`;
        while (existingNames.has(normalized(nextName))) {
            index += 1;
            nextName = `${baseName} ${index}`;
        }
        return nextName;
    }

    function exportPromptPresetsAsFile(type, payload, fileLabel) {
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileLabel;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function mergePromptPresetType(type, incomingList) {
        const incoming = normalizeImportedPresetList(incomingList, type);
        if (incoming.length === 0) return 0;

        const existing = promptPresets[type] || [];
        const merged = [...existing];
        let changed = 0;

        incoming.forEach(item => {
            const existingIdx = merged.findIndex(entry => String(entry.name || "").trim() === String(item.name || "").trim());
            if (existingIdx >= 0) {
                pushPromptPresetHistory(merged[existingIdx]);
                merged[existingIdx] = {
                    ...merged[existingIdx],
                    ...item,
                    id: merged[existingIdx].id || item.id
                };
                changed += 1;
            } else {
                merged.push(item);
                changed += 1;
            }
        });

        promptPresets[type] = type === "char"
            ? merged
            : ensureExclusivePresetState(type, merged);
        savePromptPresets(type);
        renderPromptPresetList(type);
        updatePromptPresetEditorState(type);
        updateSystemPromptPreview();
        return changed;
    }

    function getPreferredTaskPresetContent(preferredName) {
        return getTaskPresetContentByName(preferredName)
            || getPresetContentByApproxName("task", preferredName)
            || promptPresets.task.find(item => item.active)?.content
            || "";
    }

    function normalizeCharacterPromptContent(content, mode) {
        const clean = String(content || "").trim();
        if (!clean) return "";
        if (mode !== "chat_tags") return clean;
        if (/<资料>[\s\S]*<\/资料>/i.test(clean)) return clean;
        return `<资料>\n${clean}\n</资料>`;
    }

    function getCurrentCharacterNameSafe() {
        try {
            const context = getSillyTavernContextSafe();
            const characterId = context?.characterId;
            if (characterId === undefined || characterId === null || characterId < 0) return "";
            const character = context?.characters?.[characterId];
            return String(character?.name || character?.data?.name || "").trim();
        } catch (e) {
            console.warn("读取当前角色名称失败:", e);
            return "";
        }
    }

    function getPreferredCharacterPromptForChatTags() {
        const list = promptPresets.char || [];
        if (list.length === 0) return "";

        const currentCharacterName = getCurrentCharacterNameSafe().toLowerCase();
        const normalizedEntries = list.map(item => ({
            item,
            name: String(item?.name || "").trim().toLowerCase()
        }));

        const exactMatch = currentCharacterName
            ? normalizedEntries.find(entry => entry.name === currentCharacterName)?.item
            : null;
        if (exactMatch?.content) {
            return normalizeCharacterPromptContent(exactMatch.content, "chat_tags");
        }

        const fuzzyMatch = currentCharacterName
            ? normalizedEntries.find(entry => entry.name && currentCharacterName.includes(entry.name))?.item
                || normalizedEntries.find(entry => entry.name && entry.name.includes(currentCharacterName))?.item
            : null;
        if (fuzzyMatch?.content) {
            return normalizeCharacterPromptContent(fuzzyMatch.content, "chat_tags");
        }

        const activeMatch = list.find(item => item?.active && String(item.content || "").trim());
        if (activeMatch?.content) {
            return normalizeCharacterPromptContent(activeMatch.content, "chat_tags");
        }

        const latestMatch = [...list].reverse().find(item => String(item?.content || "").trim());
        return latestMatch?.content
            ? normalizeCharacterPromptContent(latestMatch.content, "chat_tags")
            : "";
    }

    function getSystemPromptForMode(mode) {
        const jailbreak = promptPresets.jailbreak.find(item => item.active)?.content || "";
        if (mode === "character_build") {
            const characterBuildTask = getPreferredTaskPresetContent("角色生成");
            return [jailbreak, characterBuildTask].filter(Boolean).join("\n\n---\n\n");
        }

        const defaultTask = getPreferredTaskPresetContent("日常生图");
        const chars = getPreferredCharacterPromptForChatTags();
        return [jailbreak, defaultTask, chars].filter(Boolean).join("\n\n---\n\n");
    }

    function updateSystemPromptPreview() {
        const el = document.getElementById("bizyair-llm-system-preview");
        if (el) el.value = getFullSystemPrompt();
    }

    function updateTagContextInput() {
        const el = document.getElementById("bizyair-tag-context");
        if (el) el.value = capturedContext;
    }

    function updateBizyairPositivePrompt(promptText) {
        if (!promptText) return;
        imageParams.positivePrompt = promptText;
        saveTemplateParams(bizyairTemplate, imageParams);
        const el = document.getElementById("bizyair-pos-prompt");
        if (el) el.value = promptText;
    }

    function saveLlmSettings() {
        localStorage.setItem(BIZYAIR_LLM_URL_KEY, llmSettings.url);
        localStorage.setItem(BIZYAIR_LLM_KEY_KEY, llmSettings.key);
        localStorage.setItem(BIZYAIR_LLM_MODEL_KEY, llmSettings.model);
        try {
            localStorage.removeItem("bizyair_llm_sys");
        } catch (e) {
            console.warn("清理旧 system prompt 存储失败:", e);
        }
    }

    function renderPromptPresetList(type) {
        const container = document.getElementById(`bizyair-list-${type}`);
        if (!container) return;
        const list = promptPresets[type] || [];
        if (list.length === 0) {
            container.innerHTML = `<div class="bizyair-hint" style="padding:8px 0;">暂无预设</div>`;
            return;
        }

        container.innerHTML = list.map(item => {
            const isSelected = presetEditorSelection[type] === item.id;
            const classes = ["bizyair-preset-item"];
            if (item.active) classes.push("active");
            if (isSelected) classes.push("editing");
            const preview = escapeHtml((item.content || "").substring(0, 90).replace(/\n/g, " "));
            const historyCount = Array.isArray(item.history) ? item.history.length : 0;
            const activeLabel = type === "char" ? (item.active ? '启用中' : '启用') : (item.active ? '默认' : '设为默认');
            const activeBg = item.active ? 'var(--bz-success)' : 'var(--bz-bg-hover)';
            return `
                <div class="${classes.join(' ')}" onclick="window.loadBizyairPresetToEditor('${type}', ${item.id})">
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:600;color:var(--bz-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px;">${escapeHtml(item.name)}</div>
                        <div style="font-size:11px;color:var(--bz-text-muted);word-break:break-word;margin-top:2px;">${preview || "空内容"}</div>
                        <div style="font-size:11px;color:var(--bz-text-dim);margin-top:3px;">${isSelected ? "编辑中" : "点击编辑"}${historyCount > 0 ? ` | 历史 ${historyCount}` : ""}</div>
                    </div>
                    <div style="display:flex;gap:4px;flex:0 0 auto;flex-wrap:wrap;">
                        <button class="bizyair-btn bizyair-btn-sm" style="background:${activeBg};color:white;" onclick="event.stopPropagation();window.toggleBizyairPromptPreset('${type}', ${item.id})">${activeLabel}</button>
                        <button class="bizyair-btn bizyair-btn-sm" style="background:#7c3aed;color:white;" onclick="event.stopPropagation();window.cloneBizyairPromptPreset('${type}', ${item.id})">复制</button>
                        <button class="bizyair-btn bizyair-btn-sm bizyair-btn-danger" onclick="event.stopPropagation();window.deleteBizyairPromptPreset('${type}', ${item.id})">删除</button>
                    </div>
                </div>
            `;
        }).join("");
    }

    function renderAllPromptPresetLists() {
        renderPromptPresetList("jailbreak");
        renderPromptPresetList("task");
        renderPromptPresetList("char");
        updatePromptPresetEditorState("jailbreak");
        updatePromptPresetEditorState("task");
        updatePromptPresetEditorState("char");
    }

    function renderLlmPanelState() {
        const urlInput = document.getElementById("bizyair-llm-url");
        const keyInput = document.getElementById("bizyair-llm-key");
        const modelInput = document.getElementById("bizyair-llm-model");
        const autoTagInput = document.getElementById("bizyair-auto-tag");
        const autoTagAfterMessageInput = document.getElementById("bizyair-auto-tag-after-message");
        const statusEl = document.getElementById("bizyair-llm-model-status");
        if (urlInput) urlInput.value = llmSettings.url;
        if (keyInput) keyInput.value = llmSettings.key;
        if (modelInput) modelInput.value = llmSettings.model;
        if (autoTagInput) autoTagInput.checked = autoTagEnabled;
        if (autoTagAfterMessageInput) autoTagAfterMessageInput.checked = autoTagAfterMessageEnabled;
        if (statusEl && !statusEl.dataset.preserve) {
            statusEl.textContent = "";
            statusEl.style.color = "#777";
        }
        updateSystemPromptPreview();
        updateTagContextInput();
        renderAllPromptPresetLists();
    }

    async function fetchBizyairLlmModels() {
        const urlInput = document.getElementById("bizyair-llm-url");
        const keyInput = document.getElementById("bizyair-llm-key");
        const currentUrl = urlInput ? urlInput.value.trim() : llmSettings.url;
        const currentKey = keyInput ? keyInput.value.trim() : llmSettings.key;

        if (!currentUrl || !currentKey) {
            showToast("请先填写 LLM URL 和 API Key");
            return;
        }

        const statusEl = document.getElementById("bizyair-llm-model-status");
        const container = document.getElementById("bizyair-llm-model-container");
        if (statusEl) {
            statusEl.textContent = "拉取中...";
            statusEl.style.color = "#888";
            statusEl.dataset.preserve = "true";
        }

        try {
            let url = currentUrl.replace(/\/$/, "");
            if (url.endsWith("/chat/completions")) url = url.slice(0, -"/chat/completions".length);
            if (url.endsWith("/models")) url = url.slice(0, -"/models".length);
            const response = await fetch(`${url}/models`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${currentKey}`
                }
            });
            if (!response.ok) {
                throw new Error(await response.text());
            }
            const data = await response.json();
            const models = (data.data || data.models || [])
                .map(item => typeof item === "string" ? item : item.id)
                .filter(Boolean);
            if (!container || models.length === 0) {
                throw new Error("未返回可用模型");
            }

            const selectedModel = llmSettings.model;
            container.innerHTML = `
                <select id="bizyair-llm-model" class="bizyair-input" style="margin-bottom:0;">
                    ${models.map(model => `<option value="${escapeHtml(model)}" ${model === selectedModel ? "selected" : ""}>${escapeHtml(model)}</option>`).join("")}
                </select>
            `;
            const modelEl = document.getElementById("bizyair-llm-model");
            if (modelEl && !models.includes(selectedModel)) {
                modelEl.value = models[0];
            }
            if (statusEl) {
                statusEl.textContent = `已拉取 ${models.length} 个模型，确认无误后点击下方保存`;
                statusEl.style.color = "#16a34a";
            }
        } catch (e) {
            console.error("拉取模型列表失败:", e);
            if (statusEl) {
                statusEl.textContent = "拉取失败";
                statusEl.style.color = "#ef4444";
            }
            showToast(`❌ 拉取模型失败: ${e.message || e}`);
        }
    }

    function getSillyTavernContextSafe() {
        try {
            if (window.SillyTavern && typeof window.SillyTavern.getContext === "function") {
                return window.SillyTavern.getContext();
            }
        } catch (e) {
            console.warn("通过 window.SillyTavern.getContext 获取上下文失败:", e);
        }

        try {
            if (typeof window.getContext === "function") {
                return window.getContext();
            }
        } catch (e) {
            console.warn("通过 window.getContext 获取上下文失败:", e);
        }

        return null;
    }

    async function ensureCharacterLoaded(context, characterId) {
        if (!context || characterId === undefined || characterId === null) return null;
        let character = context.characters?.[characterId] || null;
        if (character?.shallow && typeof context.unshallowCharacter === "function") {
            try {
                await context.unshallowCharacter(characterId);
                character = context.characters?.[characterId] || character;
            } catch (e) {
                console.warn("展开角色卡失败:", e);
            }
        }
        return character;
    }

    function normalizeLorebookEntries(data, worldName) {
        if (!data) return [];
        const entries = Array.isArray(data.entries)
            ? data.entries
            : Object.values(data.entries || {});
        return entries
            .filter(Boolean)
            .map((entry, index) => ({
                id: entry.uid ?? entry.id ?? index,
                world: worldName || data.name || "",
                keys: Array.isArray(entry.keys) ? entry.keys : [],
                secondary_keys: Array.isArray(entry.secondary_keys) ? entry.secondary_keys : [],
                comment: entry.comment || "",
                content: entry.content || "",
                enabled: entry.enabled !== false
            }));
    }

    async function buildCharacterBuildContext() {
        const context = getSillyTavernContextSafe();
        if (!context) {
            throw new Error("未获取到 SillyTavern 上下文");
        }
        if (context.characterId === undefined || context.characterId === null || context.characterId < 0) {
            throw new Error("当前未打开角色卡聊天");
        }

        const character = await ensureCharacterLoaded(context, context.characterId);
        if (!character) {
            throw new Error("当前角色数据不可用");
        }

        const card = character.data || character;
        const lines = [];
        const pushField = (label, value) => {
            if (value === undefined || value === null) return;
            if (Array.isArray(value) && value.length === 0) return;
            const text = Array.isArray(value) ? value.join(", ") : String(value).trim();
            if (!text) return;
            lines.push(`[${label}]`);
            lines.push(text);
            lines.push("");
        };

        pushField("角色名", character.name || card.name || "");
        pushField("描述", card.description || "");
        pushField("性格", card.personality || "");
        pushField("场景", card.scenario || "");
        pushField("首条消息", card.first_mes || "");
        pushField("示例对话", card.mes_example || "");
        pushField("作者备注", card.creator_notes || card.creatorcomment || "");
        pushField("系统提示词", card.system_prompt || "");
        pushField("历史后指令", card.post_history_instructions || "");
        pushField("标签", card.tags || []);
        pushField("备用问候", card.alternate_greetings || []);

        const worldSections = [];
        const appendWorldSection = (title, entries) => {
            if (!entries || entries.length === 0) return;
            const formatted = entries.map((entry, idx) => {
                const parts = [
                    `条目 ${idx + 1}`,
                    entry.keys?.length ? `主键: ${entry.keys.join(", ")}` : "",
                    entry.secondary_keys?.length ? `副键: ${entry.secondary_keys.join(", ")}` : "",
                    entry.comment ? `备注: ${entry.comment}` : "",
                    entry.content ? `内容: ${entry.content}` : ""
                ].filter(Boolean);
                return parts.join("\n");
            }).join("\n\n");
            worldSections.push(`[${title}]`);
            worldSections.push(formatted);
            worldSections.push("");
        };

        const primaryWorldName = card.extensions?.world || "";
        if (primaryWorldName && typeof context.loadWorldInfo === "function") {
            try {
                const worldData = await context.loadWorldInfo(primaryWorldName);
                appendWorldSection(`关联世界书: ${primaryWorldName}`, normalizeLorebookEntries(worldData, primaryWorldName));
            } catch (e) {
                console.warn("读取角色关联世界书失败:", e);
            }
        }

        if (card.character_book) {
            appendWorldSection(`角色卡内嵌世界书: ${card.character_book.name || `${character.name} Lorebook`}`, normalizeLorebookEntries(card.character_book, card.character_book.name || ""));
        }

        return [
            "请基于下面的 SillyTavern 角色卡和关联世界书信息，完成角色构建并输出适合生图的结果。",
            "",
            ...lines,
            ...worldSections
        ].join("\n").trim();
    }

    function upsertCharacterPromptPreset(name, content) {
        const safeName = String(name || "").trim() || "未命名角色";
        const safeContent = String(content || "").trim();
        if (!safeContent) return;

        const existingIdx = promptPresets.char.findIndex(entry => entry.name === safeName);
        let target = null;
        if (existingIdx >= 0) {
            pushPromptPresetHistory(promptPresets.char[existingIdx]);
            promptPresets.char[existingIdx].content = safeContent;
            promptPresets.char[existingIdx].active = true;
            target = promptPresets.char[existingIdx];
        } else {
            target = {
                id: Date.now(),
                name: safeName,
                content: safeContent,
                active: true,
                history: []
            };
            promptPresets.char.push(target);
        }

        promptPresets.char.forEach(entry => {
            if (entry.name !== safeName) entry.active = false;
        });
        presetEditorSelection.char = target?.id || null;
        savePromptPresets("char");
        renderPromptPresetList("char");
        updateSystemPromptPreview();
        updatePromptPresetEditorState("char");
    }

    function openTaggerWithContext(text) {
        capturedContext = text || "";
        localStorage.setItem(BIZYAIR_CONTEXT_KEY, capturedContext);
        updateTagContextInput();
        const modal = document.getElementById("bizyair-settings-modal");
        if (modal) {
            if (!modal.open) modal.showModal();
            window.switchBizyairTab("tagger");
        }
    }

    function getCleanApiUrl(pathType) {
        let url = (llmSettings.url || "").trim().replace(/\/$/, "");
        if (url.endsWith("/chat/completions")) url = url.slice(0, -"/chat/completions".length);
        if (url.endsWith("/models")) url = url.slice(0, -"/models".length);
        if (pathType === "chat") return `${url}/chat/completions`;
        if (pathType === "models") return `${url}/models`;
        return url;
    }

    function collectTextNodeMap(rootElement) {
        let textMap = [];
        let fullText = "";

        function traverse(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                for (let i = 0; i < node.nodeValue.length; i++) {
                    textMap.push({ node, offset: i, char: node.nodeValue[i] });
                }
                fullText += node.nodeValue;
            } else {
                node.childNodes.forEach(traverse);
            }
        }

        traverse(rootElement);
        return { textMap, fullText };
    }

    function normalizeLocatorText(text) {
        const raw = String(text || "").replace(/[\u200B-\u200D\uFEFF]/g, "");
        let normalized = "";
        let indexMap = [];
        let hasPendingSpace = false;

        for (let i = 0; i < raw.length; i++) {
            const ch = raw[i];
            if (/\s/.test(ch)) {
                hasPendingSpace = normalized.length > 0;
                continue;
            }
            if (hasPendingSpace) {
                normalized += " ";
                indexMap.push(i);
                hasPendingSpace = false;
            }
            normalized += ch.toLowerCase();
            indexMap.push(i);
        }

        if (normalized.endsWith(" ")) {
            normalized = normalized.slice(0, -1);
            indexMap.pop();
        }

        return {
            raw,
            normalized,
            indexMap
        };
    }

    function splitLocatorCandidates(locatorText) {
        const clean = String(locatorText || "").trim();
        if (!clean) return [];
        const parts = clean
            .split(/[\r\n。！？!?；;]+/g)
            .map(part => part.trim())
            .filter(Boolean);
        const candidates = [clean];
        parts
            .sort((a, b) => b.length - a.length)
            .forEach(part => {
                if (part.length >= 6 && !candidates.includes(part)) {
                    candidates.push(part);
                }
            });
        return candidates;
    }

    function findLocatorRangeInText(fullText, locatorText) {
        const exactCandidates = splitLocatorCandidates(locatorText);
        for (const candidate of exactCandidates) {
            const exactIndex = fullText.lastIndexOf(candidate);
            if (exactIndex !== -1) {
                return {
                    start: exactIndex,
                    end: exactIndex + candidate.length,
                    matchedText: candidate,
                    matchType: candidate === locatorText ? "exact" : "exact-fragment"
                };
            }
        }

        const normalizedFull = normalizeLocatorText(fullText);
        for (const candidate of exactCandidates) {
            const normalizedCandidate = normalizeLocatorText(candidate);
            if (!normalizedCandidate.normalized) continue;
            const normalizedIndex = normalizedFull.normalized.lastIndexOf(normalizedCandidate.normalized);
            if (normalizedIndex === -1) continue;
            const startOriginal = normalizedFull.indexMap[normalizedIndex];
            const endOriginal = normalizedFull.indexMap[normalizedIndex + normalizedCandidate.normalized.length - 1];
            if (startOriginal === undefined || endOriginal === undefined) continue;
            return {
                start: startOriginal,
                end: endOriginal + 1,
                matchedText: candidate,
                matchType: candidate === locatorText ? "normalized" : "normalized-fragment"
            };
        }

        return null;
    }

    function injectNodeAfterRange(rootElement, endExclusiveIndex, nodeToInject) {
        const { textMap } = collectTextNodeMap(rootElement);
        if (!textMap.length) return false;
        if (endExclusiveIndex >= textMap.length) {
            rootElement.appendChild(nodeToInject);
            return true;
        }
        const mapEntry = textMap[endExclusiveIndex - 1];
        if (!mapEntry) return false;
        const targetNode = mapEntry.node;
        const splitPoint = mapEntry.offset + 1;
        if (splitPoint < targetNode.nodeValue.length) {
            const remainderNode = targetNode.splitText(splitPoint);
            targetNode.parentNode.insertBefore(nodeToInject, remainderNode);
        } else if (targetNode.nextSibling) {
            targetNode.parentNode.insertBefore(nodeToInject, targetNode.nextSibling);
        } else {
            targetNode.parentNode.appendChild(nodeToInject);
        }
        return true;
    }

    function injectNodeAfterText(rootElement, searchText, nodeToInject) {
        const { fullText } = collectTextNodeMap(rootElement);
        const range = findLocatorRangeInText(fullText, searchText);
        if (!range) return false;
        return injectNodeAfterRange(rootElement, range.end, nodeToInject);
    }

    function getMessageIdFromElement(messageEl) {
        const mes = messageEl?.closest?.(".mes");
        if (!mes) return -1;
        const rawId = mes.getAttribute("mesid");
        const messageId = Number(rawId);
        return Number.isFinite(messageId) ? messageId : -1;
    }

    async function persistMessageTextUpdate(messageId, nextText) {
        const context = getSillyTavernContextSafe();
        if (!context || !Array.isArray(context.chat)) return false;
        if (!Number.isInteger(messageId) || messageId < 0 || messageId >= context.chat.length) return false;

        const message = context.chat[messageId];
        if (!message) return false;

        message.mes = nextText;
        if (typeof context.updateMessageBlock === "function") {
            context.updateMessageBlock(messageId, message);
        }
        if (typeof context.saveChat === "function") {
            await context.saveChat();
        }
        return true;
    }

    async function insertImageTagIntoMessageSource(messageEl, locatorText, imageTag) {
        const messageId = getMessageIdFromElement(messageEl);
        const context = getSillyTavernContextSafe();
        const rawMessage = context?.chat?.[messageId]?.mes;
        if (typeof rawMessage !== "string" || !rawMessage.trim()) return false;
        if (rawMessage.includes(imageTag)) return true;

        const range = findLocatorRangeInText(rawMessage, locatorText);
        if (!range) return false;

        const nextText = `${rawMessage.slice(0, range.end)} ${imageTag}${rawMessage.slice(range.end)}`;
        return persistMessageTextUpdate(messageId, nextText);
    }

    function applyContextFilters(text) {
        if (!text) return "";
        // Built-in: remove <image>image##...##<image> tags
        text = text.replace(/<image>image##[^#]*##<image>/g, "");
        // User-defined regex rules (one per line)
        if (contextRegexRules) {
            const lines = contextRegexRules.split("\n").map(l => l.trim()).filter(Boolean);
            for (const line of lines) {
                try {
                    const regex = new RegExp(line, "g");
                    text = text.replace(regex, "");
                } catch (e) {
                    console.warn("[BizyAir] 无效的过滤正则:", line, e);
                }
            }
        }
        return text.replace(/\n{3,}/g, "\n\n").trim();
    }

    function getLatestMessagesContext(count) {
        const context = getSillyTavernContextSafe();
        if (context && Array.isArray(context.chat) && context.chat.length > 0) {
            const recent = context.chat.slice(-count);
            return recent.map(msg => {
                let text = String(msg.mes || "").trim();
                text = applyContextFilters(text);
                return text;
            }).filter(Boolean).join("\n\n---\n\n");
        }
        // Fallback: DOM scraping if context API unavailable
        const messages = Array.from(document.querySelectorAll(".mes_text"));
        if (messages.length === 0) return "";
        return messages.slice(-count).map(el => {
            const clone = el.cloneNode(true);
            clone.querySelectorAll(".bizyair-inject-wrapper, .bizyair-result-img, button").forEach(node => node.remove());
            let text = clone.innerText.trim();
            text = applyContextFilters(text);
            return text;
        }).filter(Boolean).join("\n\n---\n\n");
    }

    function captureRecentChatContext() {
        const text = getLatestMessagesContext(2);
        if (!text) {
            showToast("⚠️ 未找到聊天记录");
            return "";
        }
        capturedContext = text;
        localStorage.setItem(BIZYAIR_CONTEXT_KEY, capturedContext);
        updateTagContextInput();
        return capturedContext;
    }

    function normalizeMessageId(value) {
        const numeric = Number.parseInt(value, 10);
        return Number.isFinite(numeric) ? numeric : -1;
    }

    function getAutoTagSkipReason(messageId) {
        const normalizedId = normalizeMessageId(messageId);
        if (!autoTagAfterMessageEnabled) return "autoTagAfterMessage disabled";
        if (!Number.isInteger(normalizedId) || normalizedId < 0) return "invalid messageId";
        if (autoTagProcessedMessageIds.has(normalizedId)) return "message already processed";
        if (!llmSettings.key) return "llm key missing";

        const context = getSillyTavernContextSafe();
        const message = context?.chat?.[normalizedId];
        if (!message) return "message not found";
        if (!String(message.mes || "").trim()) return "message empty";
        return "";
    }

    function shouldAutoTagAfterMessage(messageId) {
        return !getAutoTagSkipReason(messageId);
    }

    async function triggerAutoTagForMessage(messageId) {
        const normalizedId = normalizeMessageId(messageId);
        const skipReason = getAutoTagSkipReason(normalizedId);
        if (skipReason) {
            if (autoTagAfterMessageEnabled) {
                console.debug("[BizyAir] auto-tag skipped:", skipReason, { messageId, normalizedId });
            }
            return;
        }

        autoTagProcessedMessageIds.add(normalizedId);
        if (autoTagInFlight) {
            autoTagPendingMessageId = normalizedId;
            return;
        }

        autoTagInFlight = true;
        try {
            const text = captureRecentChatContext();
            if (!text) return;
            showToast("正在分析剧情并生成 Tag...");
            await generatePromptTags();
        } catch (e) {
            console.error("自动触发独立 API 生图失败:", e);
            showToast("自动生图失败: " + (e.message || e));
        } finally {
            autoTagInFlight = false;
            if (autoTagPendingMessageId !== null) {
                const pendingId = autoTagPendingMessageId;
                autoTagPendingMessageId = null;
                if (shouldAutoTagAfterMessage(pendingId)) {
                    triggerAutoTagForMessage(pendingId);
                }
            }
        }
    }

    function bindAutoTagAfterMessageListener() {
        if (autoTagListenerBound) return;
        const context = getSillyTavernContextSafe();
        const eventSource = context?.eventSource;
        const eventTypes = context?.eventTypes;
        if (!eventSource || !eventTypes?.CHARACTER_MESSAGE_RENDERED) return;

        eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, (messageId) => {
            if (autoTagAfterMessageEnabled) {
                console.debug("[BizyAir] CHARACTER_MESSAGE_RENDERED received:", messageId);
            }
            triggerAutoTagForMessage(messageId);
        });
        if (eventTypes.CHAT_CHANGED) {
            eventSource.on(eventTypes.CHAT_CHANGED, () => {
                autoTagProcessedMessageIds.clear();
                autoTagPendingMessageId = null;
                autoTagInFlight = false;
            });
        }
        autoTagListenerBound = true;
    }

    function injectTagTriggerIntoChat(locatorText, promptText) {
        if (!locatorText || !promptText) return null;
        const messages = document.querySelectorAll(".mes_text");
        if (messages.length === 0) return null;
        const cleanLocator = locatorText.trim();
        const safePrompt = escapeHtml(promptText);
        const slotId = `bizyair_locator_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        const wrapper = document.createElement("span");
        wrapper.className = "bizyair-inject-wrapper";
        wrapper.setAttribute("data-slot-id", slotId);
        wrapper.setAttribute("data-bizyair-locator", cleanLocator);
        wrapper.innerHTML = `
            <button class="bizyair-inject-btn" data-description="${encodeURIComponent(promptText)}" data-slot-id="${slotId}" data-bizyair-locator="${encodeURIComponent(cleanLocator)}" onclick="window.bizyairStartGenerate('${slotId}', this)">
                <span>🖼️</span> 立即生成
            </button>
        `;

        let injected = false;
        for (let i = messages.length - 1; i >= 0; i--) {
            const messageEl = messages[i];
            if (injectNodeAfterText(messageEl, cleanLocator, wrapper)) {
                injected = true;
                break;
            }
        }
        if (!injected) return null;
        tempLocators[slotId] = cleanLocator;
        wrapper.title = safePrompt;
        return slotId;
    }

    async function insertImageTagIntoChat(locatorText, promptText) {
        if (!locatorText || !promptText) return false;
        const cleanLocator = String(locatorText).trim();
        const cleanPrompt = String(promptText).trim().replace(/\s+/g, " ").replace(/#/g, ", ");
        if (!cleanLocator || !cleanPrompt) return false;

        const imageTag = `<image>image##${cleanPrompt}##<image>`;
        const messages = Array.from(document.querySelectorAll(".mes_text"));
        for (let i = messages.length - 1; i >= 0; i--) {
            const messageEl = messages[i];
            const text = messageEl.textContent || "";
            if (text.includes(imageTag)) return true;
            const inserted = await insertImageTagIntoMessageSource(messageEl, cleanLocator, imageTag);
            if (inserted) {
                setTimeout(() => scanAndInjectButtons(), 50);
                return true;
            }
        }
        return false;
    }

    async function importBridgeBackupObject(data) {
        if (!data || typeof data !== "object") {
            throw new Error("备份文件格式无效");
        }

        const importedPresets = data.presets || data.promptPresets;
        if (!importedPresets || typeof importedPresets !== "object") {
            throw new Error("未找到可导入的预设数据");
        }

        mergeImportedPromptPresets(importedPresets);

        const model = data.llmSettings?.model || data.llm?.model;
        const url = data.llmSettings?.url || data.llm?.url;
        if (url) llmSettings.url = url;
        if (model) llmSettings.model = model;
        saveLlmSettings();
        renderLlmPanelState();
    }

    function extractLlmMessageContent(data) {
        const choice = data?.choices?.[0] || null;
        const messageContent = choice?.message?.content;
        if (typeof messageContent === "string") {
            return messageContent;
        }
        if (Array.isArray(messageContent)) {
            return messageContent
                .map(item => {
                    if (typeof item === "string") return item;
                    if (typeof item?.text === "string") return item.text;
                    if (typeof item?.content === "string") return item.content;
                    return "";
                })
                .filter(Boolean)
                .join("\n")
                .trim();
        }
        if (typeof choice?.text === "string") {
            return choice.text;
        }
        if (typeof choice?.message?.refusal === "string" && choice.message.refusal.trim()) {
            return choice.message.refusal.trim();
        }
        if (typeof choice?.message?.reasoning_content === "string" && choice.message.reasoning_content.trim()) {
            return choice.message.reasoning_content.trim();
        }
        if (typeof data?.output_text === "string") {
            return data.output_text;
        }
        if (Array.isArray(data?.output)) {
            return data.output
                .flatMap(item => Array.isArray(item?.content) ? item.content : [])
                .map(item => typeof item?.text === "string" ? item.text : "")
                .filter(Boolean)
                .join("\n")
                .trim();
        }
        if (typeof data?.response === "string") {
            return data.response.trim();
        }
        return "";
    }

    function buildLlmEmptyResponseDebugInfo(data, systemPrompt, userPrompt, requestLabel) {
        const choice = data?.choices?.[0] || null;
        const previewSource = choice?.message
            ?? choice
            ?? data?.output?.[0]
            ?? data;
        const preview = (() => {
            try {
                return JSON.stringify(previewSource).slice(0, 600);
            } catch (e) {
                return String(previewSource || "").slice(0, 600);
            }
        })();
        const finishReason = choice?.finish_reason || data?.finish_reason || "unknown";
        const systemLength = String(systemPrompt || "").length;
        const userLength = String(userPrompt || "").length;
        return `${requestLabel || "llm"} 空回复 | finish_reason=${finishReason} | system_len=${systemLength} | user_len=${userLength} | preview=${preview}`;
    }

    function startBizyairLlmRequest(requestLabel) {
        if (llmAbortController) {
            try {
                llmAbortController.abort();
            } catch (e) {
                console.warn("取消上一次独立 API 请求失败:", e);
            }
        }
        llmAbortController = new AbortController();
        llmInFlightLabel = requestLabel || "llm";
        return llmAbortController;
    }

    function finishBizyairLlmRequest(controller) {
        if (controller && controller === llmAbortController) {
            llmAbortController = null;
            llmInFlightLabel = "";
        }
    }

    function cancelBizyairLlmRequest() {
        if (!llmAbortController) return false;
        try {
            llmAbortController.abort();
        } catch (e) {
            console.warn("取消独立 API 请求失败:", e);
        } finally {
            llmAbortController = null;
            llmInFlightLabel = "";
        }
        return true;
    }

    async function requestBizyairLlm(systemPrompt, userPrompt, requestLabel = "llm", signal = null) {
        if (!userPrompt) {
            throw new Error("缺少输入内容");
        }
        if (!llmSettings.key) {
            throw new Error("请先填写独立 API Key");
        }

        const payload = {
            model: llmSettings.model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: 1200
        };

        const response = await fetch(getCleanApiUrl("chat"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${llmSettings.key}`
            },
            body: JSON.stringify(payload),
            signal: signal || undefined
        });
        const rawText = await response.text();
        if (!response.ok) {
            throw new Error(`${requestLabel} 请求失败: ${rawText}`);
        }
        let data;
        try {
            data = rawText ? JSON.parse(rawText) : {};
        } catch (e) {
            throw new Error(`${requestLabel} 返回非 JSON: ${rawText.slice(0, 600)}`);
        }
        const content = extractLlmMessageContent(data);
        if (!String(content || "").trim()) {
            const debugInfo = buildLlmEmptyResponseDebugInfo(data, systemPrompt, userPrompt, requestLabel);
            console.error("独立 API 空回复详情:", {
                requestLabel,
                url: getCleanApiUrl("chat"),
                payload,
                response: data,
                debugInfo
            });
            throw new Error(debugInfo);
        }
        return content;
    }

    function parseCharacterBuildOutput(text) {
        const matches = [...String(text || "").matchAll(/<资料>([\s\S]*?)<\/资料>/g)];
        if (matches.length === 0) {
            return String(text || "").trim();
        }
        return matches.map(match => (match[1] || "").trim()).filter(Boolean).join("\n\n");
    }

    async function parseAndRenderTagOutput(text) {
        const container = document.getElementById("bizyair-tag-output");
        if (container) container.innerHTML = "";

        const locatorRegex = /(<(?:角色|定位)>)([\s\S]*?)(<\/(?:角色|定位)>)/g;
        const dataRegex = /<资料>([\s\S]*?)<\/资料>/g;
        let currentRole = null;
        let sceneIndex = 0;
        let foundAny = false;
        let match;

        while ((match = locatorRegex.exec(text)) !== null) {
            const tag = match[1];
            const content = (match[2] || "").trim();
            if (tag === "<角色>") {
                currentRole = content;
                updateBizyairPositivePrompt(content);
                continue;
            }
            if (tag === "<定位>" && currentRole) {
                sceneIndex += 1;
                foundAny = true;
                const inserted = await insertImageTagIntoChat(content, currentRole);
                if (container) {
                    container.insertAdjacentHTML("beforeend", `
                        <div class="bizyair-scene-card" data-bizyair-scene="${sceneIndex}" data-bizyair-locator="${escapeHtml(content)}">
                            <div style="font-weight:600;color:var(--bz-accent-light);margin-bottom:6px;">场景 ${sceneIndex}</div>
                            <div class="bizyair-hint" style="margin-bottom:6px;">定位: ${escapeHtml(content)}</div>
                            <div style="font-size:12px;color:${inserted ? 'var(--bz-success)' : 'var(--bz-warning)'};margin-bottom:8px;">${inserted ? '已插入 image 标签' : '未命中定位文本'}</div>
                            <textarea class="bizyair-input" rows="3" data-role-prompt="${sceneIndex}" style="margin-bottom:8px;">${escapeHtml(currentRole)}</textarea>
                            <div class="bizyair-actions">
                                <button class="bizyair-btn bizyair-btn-primary bizyair-btn-sm" onclick="window.bizyairApplyRolePrompt(${sceneIndex})">写入提示词</button>
                                <button class="bizyair-btn bizyair-btn-secondary bizyair-btn-sm" onclick="window.bizyairGenerateScene(${sceneIndex})">重新插入标签</button>
                            </div>
                        </div>
                    `);
                }
                currentRole = null;
            }
        }

        const dataMatches = [...text.matchAll(dataRegex)];
        dataMatches.forEach((dataMatch, idx) => {
            foundAny = true;
            if (container) {
                container.insertAdjacentHTML("beforeend", `
                    <div class="bizyair-scene-card">
                        <div style="font-weight:600;color:var(--bz-warning);margin-bottom:6px;">角色资料 ${idx + 1}</div>
                        <textarea class="bizyair-input" rows="4" style="margin-bottom:0;">${escapeHtml((dataMatch[1] || "").trim())}</textarea>
                    </div>
                `);
            }
        });

        if (!foundAny && container) {
            container.innerHTML = `<textarea class="bizyair-input" rows="8">${escapeHtml(text)}</textarea>`;
        }

        if (!container) {
            if (sceneIndex > 0) {
                showToast("自动生图: 已插入 " + sceneIndex + " 个场景");
            } else if (!foundAny) {
                showToast("自动生图: 未解析到场景标签");
            }
        }
    }

    async function generatePromptTags() {
        const input = document.getElementById("bizyair-tag-context");
        const button = document.getElementById("bizyair-generate-tags-btn");
        const contextText = input ? input.value.trim() : capturedContext.trim();
        const output = document.getElementById("bizyair-tag-output");
        if (!contextText) {
            showToast("请输入剧情内容");
            return;
        }
        if (!llmSettings.key) {
            showToast("请先填写独立 API Key");
            return;
        }

        capturedContext = contextText;
        localStorage.setItem(BIZYAIR_CONTEXT_KEY, capturedContext);
        if (button) {
            button.disabled = true;
            button.textContent = "分析中...";
        }
        if (output) {
            output.innerHTML = `<div style="text-align:center;padding:20px;color:#777;">Thinking...</div>`;
        }

        const controller = startBizyairLlmRequest("chat_tags");
        try {
            const content = await requestBizyairLlm(getSystemPromptForMode("chat_tags"), contextText, "chat_tags", controller.signal);
            await parseAndRenderTagOutput(content);
        } catch (e) {
            console.error("独立 API 生成失败:", e);
            if (output) {
                output.innerHTML = `<div style="color:#ef4444;padding:10px;word-break:break-word;">${escapeHtml(String(e.message || e))}</div>`;
            }
            showToast("❌ 独立 API 生成失败");
        } finally {
            finishBizyairLlmRequest(controller);
            if (button) {
                button.disabled = false;
                button.textContent = "✨ 分析并生成 Tag";
            }
        }
    }

    function restoreLocatorImages() {
        if (galleryData.length === 0) return;
        const messages = document.querySelectorAll(".mes_text");
        if (messages.length === 0) return;
        const processedLocators = new Set();

        galleryData.forEach(item => {
            if (!item || !item.locator || !item.url || processedLocators.has(item.locator)) return;
            for (let i = messages.length - 1; i >= 0; i--) {
                const messageEl = messages[i];
                if (messageEl.querySelector(`.bizyair-inject-wrapper[data-slot-id="${item.slotId}"]`)) {
                    processedLocators.add(item.locator);
                    break;
                }
                const wrapper = document.createElement("span");
                wrapper.className = "bizyair-inject-wrapper";
                renderImageResult(wrapper, item.slotId, item.prompt || "", item.url);
                wrapper.setAttribute("data-bizyair-locator", item.locator);
                if (injectNodeAfterText(messageEl, item.locator, wrapper)) {
                    processedLocators.add(item.locator);
                }
                break;
            }
        });
    }

    function initLocatorRestoreObserver() {
        if (restoreObserver) return;
        restoreLocatorImages();
        restoreObserver = new MutationObserver(() => {
            if (restoreTimer) clearTimeout(restoreTimer);
            restoreTimer = setTimeout(() => {
                restoreLocatorImages();
            }, 600);
        });
        restoreObserver.observe(document.body, { childList: true, subtree: true });
    }

    function closeMagicActionModal() {
        const modal = document.getElementById("bizyair-magic-action-modal");
        if (modal) modal.remove();
    }

    function closeCharacterBuildReviewModal() {
        const modal = document.getElementById("bizyair-character-build-modal");
        if (modal) modal.remove();
    }

    function renderCharacterBuildReviewState() {
        const modal = document.getElementById("bizyair-character-build-modal");
        if (!modal) return;

        const titleEl = modal.querySelector("[data-bizyair-build-title]");
        const textEl = modal.querySelector("[data-bizyair-build-text]");
        const statusEl = modal.querySelector("[data-bizyair-build-status]");
        const saveBtn = modal.querySelector("[data-bizyair-build-save]");
        const retryBtn = modal.querySelector("[data-bizyair-build-retry]");

        if (titleEl) {
            titleEl.textContent = pendingCharacterBuild?.characterName
                ? `角色资料预览: ${pendingCharacterBuild.characterName}`
                : "角色资料预览";
        }
        if (textEl) {
            textEl.value = pendingCharacterBuild?.profile || "";
            textEl.disabled = !!pendingCharacterBuild?.loading;
        }
        if (statusEl) {
            if (pendingCharacterBuild?.loading) {
                statusEl.textContent = "正在生成角色资料...";
                statusEl.style.color = "#888";
            } else if (pendingCharacterBuild?.error) {
                statusEl.textContent = `生成失败: ${pendingCharacterBuild.error}`;
                statusEl.style.color = "#ef4444";
            } else {
                statusEl.textContent = "确认后保存，或打回重写。";
                statusEl.style.color = "#aaa";
            }
        }
        if (saveBtn) saveBtn.disabled = !!pendingCharacterBuild?.loading || !String(pendingCharacterBuild?.profile || "").trim();
        if (retryBtn) retryBtn.disabled = !!pendingCharacterBuild?.loading;
    }

    function openCharacterBuildReviewModal() {
        closeCharacterBuildReviewModal();
        const modal = document.createElement("dialog");
        modal.id = "bizyair-character-build-modal";
        modal.className = "bizyair-overlay bizyair-overlay-top";
        modal.innerHTML = `
            <div class="bizyair-modal-shell" style="width:min(760px, calc(100vw - 24px));max-width:760px;height:auto;max-height:min(88vh,960px);">
                <div class="bizyair-modal-header">
                    <span class="bizyair-title" data-bizyair-build-title>角色资料预览</span>
                    <button class="bizyair-modal-close" onclick="window.closeBizyairCharacterBuildModal()">&times;</button>
                </div>
                <div class="bizyair-view-scroll" style="padding-top:12px;">
                    <div data-bizyair-build-status class="bizyair-hint" style="margin-bottom:10px;">确认后保存，或打回重写。</div>
                    <textarea data-bizyair-build-text class="bizyair-input" rows="16" style="min-height:280px;margin-bottom:12px;"></textarea>
                    <div class="bizyair-actions" style="justify-content:flex-end;">
                        <button type="button" class="bizyair-btn bizyair-btn-secondary" data-bizyair-build-retry onclick="window.retryBizyairCharacterBuild()">打回重写</button>
                        <button type="button" class="bizyair-btn bizyair-btn-primary" data-bizyair-build-save onclick="window.saveBizyairCharacterBuild()">保存</button>
                    </div>
                </div>
            </div>
        `;
        modal.addEventListener("click", (event) => {
            if (event.target === modal) closeCharacterBuildReviewModal();
        });
        document.body.appendChild(modal);
        modal.showModal();
        renderCharacterBuildReviewState();
    }

    async function runCharacterBuildRequest() {
        if (!pendingCharacterBuild?.sourceText) {
            throw new Error("缺少角色构建上下文");
        }

        pendingCharacterBuild.loading = true;
        pendingCharacterBuild.error = "";
        renderCharacterBuildReviewState();

        const controller = startBizyairLlmRequest("character_build");
        try {
            const content = await requestBizyairLlm(getSystemPromptForMode("character_build"), pendingCharacterBuild.sourceText, "character_build", controller.signal);
            const profile = parseCharacterBuildOutput(content);
            if (!String(profile || "").trim()) {
                throw new Error("角色构建结果为空");
            }
            pendingCharacterBuild.profile = profile;
        } catch (e) {
            pendingCharacterBuild.profile = "";
            pendingCharacterBuild.error = e.message || String(e);
            throw e;
        } finally {
            finishBizyairLlmRequest(controller);
            pendingCharacterBuild.loading = false;
            renderCharacterBuildReviewState();
        }
    }

    function openMagicActionModal() {
        closeMagicActionModal();
        const modal = document.createElement("dialog");
        modal.id = "bizyair-magic-action-modal";
        modal.className = "bizyair-overlay";
        modal.innerHTML = `
            <div class="bizyair-modal-shell" style="width:min(420px, calc(100vw - 24px));max-width:420px;height:auto;padding:18px;">
                <div class="bizyair-row-inline" style="justify-content:space-between;margin-bottom:14px;">
                    <div>
                        <div style="font-size:16px;font-weight:700;color:var(--bz-text);">独立 Tag 工具</div>
                        <div class="bizyair-hint" style="margin-top:4px;">双击酒馆魔法棒后选择执行路径</div>
                    </div>
                    <button class="bizyair-modal-close" onclick="window.closeBizyairMagicActionModal()">&times;</button>
                </div>
                <button type="button" class="bizyair-btn bizyair-btn-primary bizyair-btn-full" style="margin:0 0 10px 0;" onclick="window.startBizyairChatTagFlow()">开始生图</button>
                <button type="button" class="bizyair-btn bizyair-btn-secondary bizyair-btn-full" style="margin:0;" onclick="window.startBizyairCharacterBuildFlow()">角色构建</button>
            </div>
        `;
        modal.addEventListener("click", (event) => {
            if (event.target === modal) closeMagicActionModal();
        });
        document.body.appendChild(modal);
        modal.showModal();
    }

    function createSettingsModal() {
        const existingModal = document.getElementById("bizyair-settings-modal");
        if (existingModal) existingModal.remove();

        const templateOptions = buildTemplateOptionsHtml(bizyairTemplate);
        
        const div = document.createElement("dialog");
        div.id = "bizyair-settings-modal";
        div.innerHTML = `
            <div class="bizyair-modal-shell">
                <div class="bizyair-modal-header">
                    <span class="bizyair-title">BizyAir 设置</span>
                    <button class="bizyair-modal-close" onclick="document.getElementById('bizyair-settings-modal').close()">&times;</button>
                </div>

                <div class="bizyair-tabs">
                    <div class="bizyair-tab active" data-tab="settings" onclick="window.switchBizyairTab('settings')">设置</div>
                    <div class="bizyair-tab" data-tab="tagger" onclick="window.switchBizyairTab('tagger')">Tag</div>
                    <div class="bizyair-tab" data-tab="gallery" onclick="window.switchBizyairTab('gallery')">画廊</div>
                </div>

                <!-- ===== 设置 Tab ===== -->
                <div id="bizyair-view-settings" class="bizyair-view bizyair-view-scroll">
                    <div class="bizyair-panel-card">
                        <div class="bizyair-field">
                            <label class="bizyair-compact-label">API Key</label>
                            <textarea id="bizyair-api-key" class="bizyair-input" rows="2" placeholder="API Key（多个用逗号分隔）" style="margin-bottom:10px;">${escapeHtml(bizyairApiKey)}</textarea>
                        </div>
                        <div class="bizyair-field">
                            <label class="bizyair-compact-label">生图模板</label>
                            <select id="bizyair-template" class="bizyair-input" onchange="window.switchBizyairTemplate(this.value)" style="margin-bottom:10px;">${templateOptions}</select>
                        </div>
                        <div class="bizyair-field">
                            <label class="bizyair-compact-label">Web App ID</label>
                            <input type="text" id="bizyair-web-app-id" class="bizyair-input" value="${bizyairWebAppId}" placeholder="默认: ${getTemplateDef(bizyairTemplate).defaultWebAppId}" style="margin-bottom:0;">
                        </div>
                    </div>

                    <div class="bizyair-panel-card">
                        <label class="bizyair-check-row">
                            <input type="checkbox" id="bizyair-auto-gen" ${autoGenEnabled ? 'checked' : ''} onchange="window.toggleAutoGen(this.checked)">
                            <span>检测到 image## 时自动生图</span>
                        </label>
                        <label class="bizyair-check-row">
                            <input type="checkbox" id="bizyair-auto-tag-after-message" ${autoTagAfterMessageEnabled ? 'checked' : ''} onchange="window.toggleAutoTagAfterMessage(this.checked)">
                            <span>正文生成后自动触发独立 API</span>
                        </label>
                        <label class="bizyair-check-row">
                            <input type="checkbox" id="bizyair-queue-limit" ${queueLimitEnabled ? 'checked' : ''} onchange="window.toggleQueueLimit(this.checked)">
                            <span>后台排队模式（最多同时 2 个）</span>
                        </label>
                        <div class="bizyair-hint">免费账号：生成 1 张 + 队列 1 张，其余本地等待。</div>
                    </div>

                    <div class="bizyair-section-title">生图参数</div>
                    <div class="bizyair-panel-card">
                        <div class="bizyair-two-col">
                            <div class="bizyair-field">
                                <label class="bizyair-compact-label">宽度</label>
                                <input type="number" id="bizyair-width" class="bizyair-input" value="${imageParams.width}">
                            </div>
                            <div class="bizyair-field">
                                <label class="bizyair-compact-label">高度</label>
                                <input type="number" id="bizyair-height" class="bizyair-input" value="${imageParams.height}">
                            </div>
                            <div class="bizyair-field">
                                <label class="bizyair-compact-label">步数</label>
                                <input type="number" id="bizyair-steps" class="bizyair-input" value="${imageParams.steps}">
                            </div>
                            <div class="bizyair-field">
                                <label class="bizyair-compact-label">种子</label>
                                <input type="number" id="bizyair-seed" class="bizyair-input" value="${imageParams.seed}">
                            </div>
                            <div class="bizyair-field">
                                <label class="bizyair-compact-label">缩放</label>
                                <input type="number" step="0.1" id="bizyair-scale" class="bizyair-input" value="${imageParams.scaleBy}">
                            </div>
                            <div class="bizyair-field">
                                <label class="bizyair-compact-label">CFG</label>
                                <input type="number" step="0.1" id="bizyair-cfg" class="bizyair-input" value="${imageParams.cfg}">
                            </div>
                        </div>

                        <div class="bizyair-field" style="margin-top:10px;">
                            <label class="bizyair-compact-label">采样器</label>
                            <select id="bizyair-sampler" class="bizyair-input">
                                <option value="euler" ${imageParams.sampler === 'euler' ? 'selected' : ''}>euler</option>
                                <option value="euler_ancestral" ${imageParams.sampler === 'euler_ancestral' ? 'selected' : ''}>euler_ancestral</option>
                                <option value="dpm_2" ${imageParams.sampler === 'dpm_2' ? 'selected' : ''}>dpm_2</option>
                                <option value="dpm_2_ancestral" ${imageParams.sampler === 'dpm_2_ancestral' ? 'selected' : ''}>dpm_2_ancestral</option>
                                <option value="dpmpp_2m" ${imageParams.sampler === 'dpmpp_2m' ? 'selected' : ''}>dpmpp_2m</option>
                                <option value="uni_pc" ${imageParams.sampler === 'uni_pc' ? 'selected' : ''}>uni_pc</option>
                            </select>
                        </div>

                        <div class="bizyair-field" style="margin-top:6px;">
                            <label class="bizyair-compact-label">正面提示词</label>
                            <textarea id="bizyair-pos-prompt" class="bizyair-input" rows="2">${imageParams.positivePrompt || ""}</textarea>
                        </div>
                        <div class="bizyair-field">
                            <label class="bizyair-compact-label">负面提示词</label>
                            <textarea id="bizyair-neg-prompt" class="bizyair-input" rows="2">${imageParams.negativePrompt}</textarea>
                        </div>

                        <label class="bizyair-check-row">
                            <input type="checkbox" id="bizyair-random-seed" ${imageParams.randomSeed ? 'checked' : ''} onchange="window.toggleRandomSeed(this.checked)">
                            <span>随机种子</span>
                        </label>
                        <div id="bizyair-seed-hint" class="bizyair-hint"></div>
                    </div>

                    <button type="button" class="bizyair-btn bizyair-btn-secondary bizyair-btn-full" onclick="window.toggleBizyairAdvanced()">高级参数</button>
                    <div id="bizyair-advanced-panel" style="display:none;margin-top:10px;">
                        <div class="bizyair-panel-card">
                            <div class="bizyair-two-col">
                                <div class="bizyair-field">
                                    <label class="bizyair-compact-label">Scheduler</label>
                                    <input type="text" id="bizyair-scheduler" class="bizyair-input" value="${imageParams.scheduler || ''}">
                                </div>
                                <div class="bizyair-field">
                                    <label class="bizyair-compact-label">Denoise</label>
                                    <input type="number" step="0.01" id="bizyair-denoise" class="bizyair-input" value="${imageParams.denoise !== undefined ? imageParams.denoise : ''}">
                                </div>
                                <div class="bizyair-field">
                                    <label class="bizyair-compact-label">宽高比</label>
                                    <input type="text" id="bizyair-aspect-ratio" class="bizyair-input" value="${imageParams.aspectRatio || ''}">
                                </div>
                                <div class="bizyair-field">
                                    <label class="bizyair-compact-label">分辨率</label>
                                    <input type="text" id="bizyair-resolution" class="bizyair-input" value="${imageParams.resolution || ''}">
                                </div>
                            </div>
                        </div>
                    </div>

                    <button class="bizyair-btn bizyair-btn-primary bizyair-btn-full" style="margin-top:10px;" onclick="window.saveBizyairSettings()">保存设置</button>
                    <div id="bizyair-save-hint" class="bizyair-hint"></div>

                    <div class="bizyair-section-title">模板导入</div>
                    <div class="bizyair-panel-card">
                        <div class="bizyair-field">
                            <label class="bizyair-compact-label">模板名称</label>
                            <input type="text" id="bizyair-import-label" class="bizyair-input" placeholder="例如：我的模板">
                        </div>
                        <div class="bizyair-field">
                            <label class="bizyair-compact-label">原始 API 文本</label>
                            <textarea id="bizyair-import-raw" class="bizyair-input" rows="5" placeholder="粘贴原样的 API 示例代码"></textarea>
                        </div>
                        <button type="button" class="bizyair-btn bizyair-btn-secondary bizyair-btn-full" onclick="window.parseBizyairTemplate()">解析模板</button>
                        <button type="button" id="bizyair-import-confirm" class="bizyair-btn bizyair-btn-primary bizyair-btn-full" style="margin-top:8px;" onclick="window.confirmBizyairImport()" disabled>确认导入</button>
                        <div id="bizyair-import-hint" class="bizyair-hint">支持粘贴多个示例进行解析。</div>
                        <div id="bizyair-import-review" style="margin-top:10px;"></div>
                    </div>

                    <div class="bizyair-section-title">自定义模板管理</div>
                    <div id="bizyair-custom-templates"></div>
                    <div class="bizyair-view-end-spacer" aria-hidden="true"></div>
                </div>

                <!-- ===== Tag Tab ===== -->
                <div id="bizyair-view-tagger" class="bizyair-view bizyair-view-scroll" style="display:none;">
                    <div class="bizyair-panel-card">
                        <div class="bizyair-row-inline" style="justify-content:space-between;margin-bottom:10px;">
                            <div>
                                <div class="bizyair-panel-card-title" style="margin-bottom:2px;">独立 API 配置</div>
                                <div class="bizyair-panel-card-subtitle">通过独立 LLM 生成 Tag</div>
                            </div>
                            <label class="bizyair-check-row" style="padding:0;">
                                <input type="checkbox" id="bizyair-auto-tag" ${autoTagEnabled ? "checked" : ""}>
                                <span>解析后自动生图</span>
                            </label>
                        </div>

                        <div class="bizyair-field">
                            <label class="bizyair-compact-label">LLM URL</label>
                            <input type="text" id="bizyair-llm-url" class="bizyair-input" value="${escapeHtml(llmSettings.url)}" placeholder="https://api.openai.com/v1">
                        </div>
                        <div class="bizyair-field">
                            <label class="bizyair-compact-label">LLM API Key</label>
                            <input type="password" id="bizyair-llm-key" class="bizyair-input" value="${escapeHtml(llmSettings.key)}" placeholder="输入独立 API Key">
                        </div>
                        <div class="bizyair-field">
                            <label class="bizyair-compact-label">模型</label>
                            <div class="bizyair-row-inline" style="gap:8px;">
                                <div id="bizyair-llm-model-container" style="flex:1;min-width:0;">
                                    <input type="text" id="bizyair-llm-model" class="bizyair-input" value="${escapeHtml(llmSettings.model)}" placeholder="gpt-4o-mini" style="margin-bottom:0;">
                                </div>
                                <button class="bizyair-btn bizyair-btn-secondary bizyair-btn-sm" style="flex-shrink:0;" onclick="window.fetchBizyairLlmModels()">拉取模型</button>
                            </div>
                        </div>
                        <div id="bizyair-llm-model-status" data-preserve="false" class="bizyair-hint"></div>

                        <div class="bizyair-field" style="margin-top:8px;">
                            <label class="bizyair-compact-label">System Prompt 预览</label>
                            <textarea id="bizyair-llm-system-preview" class="bizyair-input" rows="4" readonly style="opacity:0.7;"></textarea>
                        </div>

                        <button class="bizyair-btn bizyair-btn-primary bizyair-btn-full" onclick="window.saveBizyairLlmSettings()">保存独立 API 配置</button>
                    </div>

                    <div class="bizyair-panel-card">
                        <div class="bizyair-panel-card-title">系统预设</div>

                        <div class="bizyair-panel-card" style="background:var(--bz-bg-input);margin-bottom:12px;">
                            <div class="bizyair-row-inline" style="justify-content:space-between;margin-bottom:8px;">
                                <div>
                                    <div style="color:var(--bz-text);font-size:12px;">Bridge 备份导入</div>
                                    <div class="bizyair-hint">ComfyBridge_Backup_*.json</div>
                                </div>
                                <input type="file" id="bizyair-bridge-backup-file" accept=".json,application/json" style="display:none;" onchange="window.importBizyairBridgeBackup(this)">
                                <label for="bizyair-bridge-backup-file" class="bizyair-btn bizyair-btn-primary bizyair-btn-sm" style="cursor:pointer;">一键导入</label>
                            </div>
                        </div>

                        <div class="bizyair-stack" style="gap:16px;">
                            <div>
                                <div style="color:#f87171;font-size:12px;font-weight:600;margin-bottom:6px;">Jailbreak</div>
                                <input type="text" id="bizyair-inp-jailbreak-name" class="bizyair-input" placeholder="预设名称">
                                <textarea id="bizyair-inp-jailbreak-content" class="bizyair-input" rows="3" placeholder="输入 Jailbreak 内容"></textarea>
                                <div class="bizyair-actions" style="margin-bottom:6px;">
                                    <button class="bizyair-btn bizyair-btn-secondary bizyair-btn-sm" onclick="window.newBizyairPromptPreset('jailbreak')">新建</button>
                                    <button class="bizyair-btn bizyair-btn-primary bizyair-btn-sm" onclick="window.saveBizyairPromptPreset('jailbreak')">保存</button>
                                    <button class="bizyair-btn bizyair-btn-sm" style="background:#7c3aed;color:white;" onclick="window.saveBizyairPromptPresetAsNew('jailbreak')">另存为</button>
                                </div>
                                <div class="bizyair-actions" style="margin-bottom:6px;">
                                    <input type="file" id="bizyair-import-jailbreak-file" accept=".json,application/json" style="display:none;" onchange="window.importBizyairPromptPreset('jailbreak', this)">
                                    <label for="bizyair-import-jailbreak-file" class="bizyair-btn bizyair-btn-secondary bizyair-btn-sm" style="cursor:pointer;">导入</label>
                                    <button class="bizyair-btn bizyair-btn-sm bizyair-btn-success" onclick="window.exportBizyairPromptPreset('jailbreak')">导出</button>
                                </div>
                                <div id="bizyair-preset-status-jailbreak" class="bizyair-hint">当前为新建模式</div>
                                <div id="bizyair-list-jailbreak"></div>
                            </div>

                            <div>
                                <div style="color:#38bdf8;font-size:12px;font-weight:600;margin-bottom:6px;">Task</div>
                                <input type="text" id="bizyair-inp-task-name" class="bizyair-input" placeholder="预设名称">
                                <textarea id="bizyair-inp-task-content" class="bizyair-input" rows="3" placeholder="输入 Task 内容"></textarea>
                                <div class="bizyair-actions" style="margin-bottom:6px;">
                                    <button class="bizyair-btn bizyair-btn-secondary bizyair-btn-sm" onclick="window.newBizyairPromptPreset('task')">新建</button>
                                    <button class="bizyair-btn bizyair-btn-primary bizyair-btn-sm" onclick="window.saveBizyairPromptPreset('task')">保存</button>
                                    <button class="bizyair-btn bizyair-btn-sm" style="background:#7c3aed;color:white;" onclick="window.saveBizyairPromptPresetAsNew('task')">另存为</button>
                                </div>
                                <div class="bizyair-actions" style="margin-bottom:6px;">
                                    <input type="file" id="bizyair-import-task-file" accept=".json,application/json" style="display:none;" onchange="window.importBizyairPromptPreset('task', this)">
                                    <label for="bizyair-import-task-file" class="bizyair-btn bizyair-btn-secondary bizyair-btn-sm" style="cursor:pointer;">导入</label>
                                    <button class="bizyair-btn bizyair-btn-sm bizyair-btn-success" onclick="window.exportBizyairPromptPreset('task')">导出</button>
                                </div>
                                <div id="bizyair-preset-status-task" class="bizyair-hint">当前为新建模式</div>
                                <div id="bizyair-list-task"></div>
                            </div>

                            <div>
                                <div style="color:#f472b6;font-size:12px;font-weight:600;margin-bottom:6px;">角色</div>
                                <input type="text" id="bizyair-inp-char-name" class="bizyair-input" placeholder="角色名称">
                                <textarea id="bizyair-inp-char-content" class="bizyair-input" rows="3" placeholder="输入角色设定"></textarea>
                                <div class="bizyair-actions" style="margin-bottom:6px;">
                                    <button class="bizyair-btn bizyair-btn-secondary bizyair-btn-sm" onclick="window.newBizyairPromptPreset('char')">新建</button>
                                    <button class="bizyair-btn bizyair-btn-primary bizyair-btn-sm" onclick="window.saveBizyairPromptPreset('char')">保存</button>
                                    <button class="bizyair-btn bizyair-btn-sm" style="background:#7c3aed;color:white;" onclick="window.saveBizyairPromptPresetAsNew('char')">另存为</button>
                                </div>
                                <div class="bizyair-actions" style="margin-bottom:6px;">
                                    <input type="file" id="bizyair-import-char-file" accept=".json,application/json" style="display:none;" onchange="window.importBizyairPromptPreset('char', this)">
                                    <label for="bizyair-import-char-file" class="bizyair-btn bizyair-btn-secondary bizyair-btn-sm" style="cursor:pointer;">导入</label>
                                    <button class="bizyair-btn bizyair-btn-sm bizyair-btn-success" onclick="window.exportBizyairPromptPreset('char')">导出</button>
                                </div>
                                <div id="bizyair-preset-status-char" class="bizyair-hint">当前为新建模式</div>
                                <div id="bizyair-list-char"></div>
                            </div>
                        </div>
                    </div>

                    <div class="bizyair-panel-card">
                        <div class="bizyair-row-inline" style="justify-content:space-between;margin-bottom:10px;">
                            <div>
                                <div class="bizyair-panel-card-title" style="margin-bottom:2px;">Prompt Lab</div>
                                <div class="bizyair-panel-card-subtitle">从最近消息提取上下文</div>
                            </div>
                            <button class="bizyair-btn bizyair-btn-secondary bizyair-btn-sm" onclick="window.captureBizyairContext()">抓取</button>
                        </div>
                        <textarea id="bizyair-tag-context" class="bizyair-input" rows="4" placeholder="剧情内容...">${escapeHtml(capturedContext)}</textarea>

                        <div class="bizyair-field" style="margin-bottom:10px;">
                            <label class="bizyair-compact-label">正文过滤正则（每行一条，匹配到的内容会被移除）</label>
                            <textarea id="bizyair-context-regex" class="bizyair-input" rows="3" placeholder="例如：\\[.*?\\]&#10;<.*?>&#10;\\(OOC:.*?\\)">${escapeHtml(contextRegexRules)}</textarea>
                            <button class="bizyair-btn bizyair-btn-secondary bizyair-btn-sm" onclick="window.saveBizyairContextRegex()">保存过滤规则</button>
                        </div>

                        <button id="bizyair-generate-tags-btn" class="bizyair-btn bizyair-btn-primary bizyair-btn-full" style="margin-bottom:10px;" onclick="window.generateBizyairTags()">分析并生成 Tag</button>
                        <div id="bizyair-tag-output" style="min-height:60px;">
                            <div class="bizyair-hint" style="text-align:center;padding:16px;">暂无结果</div>
                        </div>
                    </div>
                    <div class="bizyair-view-end-spacer" aria-hidden="true"></div>
                </div>

                <!-- ===== 画廊 Tab ===== -->
                <div id="bizyair-view-gallery" class="bizyair-view bizyair-view-scroll" style="display:none;">
                    <div class="bizyair-row-inline" style="gap:8px;margin-bottom:14px;">
                        <button class="bizyair-btn bizyair-btn-secondary" style="flex:1;" onclick="window.downloadAllGalleryImages()">全部下载</button>
                        <button id="bizyair-edit-btn" class="bizyair-btn bizyair-btn-secondary" style="flex:1;" onclick="window.toggleGalleryEditMode()">编辑</button>
                        <button class="bizyair-btn bizyair-btn-danger" style="flex:1;" onclick="window.clearAllGallery()">清空</button>
                    </div>
                    <div id="bizyair-gallery-actions" class="bizyair-panel-card bizyair-row-inline" style="display:none;margin-bottom:14px;">
                        <span class="bizyair-hint" style="flex:1;display:flex;align-items:center;">已选 <span id="bizyair-selected-count" style="color:var(--bz-accent);margin:0 4px;">0</span> 张</span>
                        <button class="bizyair-btn bizyair-btn-primary bizyair-btn-sm" onclick="window.downloadSelectedGallery()">下载</button>
                        <button class="bizyair-btn bizyair-btn-danger bizyair-btn-sm" onclick="window.deleteSelectedGallery()">删除</button>
                        <button class="bizyair-btn bizyair-btn-secondary bizyair-btn-sm" onclick="window.toggleGalleryEditMode()">取消</button>
                    </div>
                    <div id="bizyair-gallery-grid"></div>
                    <div class="bizyair-view-end-spacer" aria-hidden="true"></div>
                </div>
            </div>
        `;
        document.body.appendChild(div);

        applyParamsToUI(imageParams);
        updateSeedControls(bizyairTemplate, imageParams);
        renderCustomTemplateList();
        updateGalleryCount();
        renderLlmPanelState();

        window.switchBizyairTab = function(tab) {
            document.querySelectorAll('.bizyair-tab').forEach(t => t.classList.remove('active'));
            const activeTab = document.querySelector(`.bizyair-tab[data-tab="${tab}"]`);
            if (activeTab) activeTab.classList.add('active');

            document.getElementById('bizyair-view-settings').style.display = tab === 'settings' ? 'block' : 'none';
            document.getElementById('bizyair-view-tagger').style.display = tab === 'tagger' ? 'block' : 'none';
            document.getElementById('bizyair-view-gallery').style.display = tab === 'gallery' ? 'block' : 'none';

            if (tab === 'gallery') renderGallery();
        };

        document.getElementById("bizyair-view-tagger").style.display = "none";
        document.getElementById("bizyair-view-gallery").style.display = "none";
    }

    window.toggleAutoGen = function(checked) {
        autoGenEnabled = checked;
        localStorage.setItem("bizyair_auto_gen", checked);
        showToast(checked ? "⚡ 自动生图已开启" : "⏸️ 自动生图已关闭");
    };

    window.toggleAutoTagAfterMessage = function(checked) {
        autoTagAfterMessageEnabled = checked;
        localStorage.setItem(BIZYAIR_AUTO_TAG_AFTER_MESSAGE_KEY, String(checked));
        showToast(checked ? "✅ 正文后自动触发已开启" : "⏸️ 正文后自动触发已关闭");
    };

    window.saveBizyairContextRegex = function() {
        const el = document.getElementById("bizyair-context-regex");
        contextRegexRules = el ? el.value : "";
        localStorage.setItem(BIZYAIR_CONTEXT_REGEX_KEY, contextRegexRules);
        showToast("✅ 过滤规则已保存");
    };

    window.toggleQueueLimit = function(checked) {
        queueLimitEnabled = checked;
        localStorage.setItem("bizyair_queue_limit", checked);
        if (!checked) {
            if (queueDispatchTimer) {
                clearTimeout(queueDispatchTimer);
                queueDispatchTimer = null;
            }
            if (scheduledQueueDispatch?.assignedKey) {
                releaseBizyairApiKeySlot(scheduledQueueDispatch.assignedKey);
                slotAssignedApiKeys.delete(scheduledQueueDispatch.slotId);
            }
            scheduledQueueDispatch = null;
            queuedGenerationSlots.clear();
            pendingGenerationQueue.length = 0;
            scanAndInjectButtons();
            showToast("⏸️ 后台排队模式已关闭");
            return;
        }
        processPendingGenerationQueue();
        showToast("🚦 后台排队模式已开启");
    };

    window.saveBizyairLlmSettings = function() {
        const modelEl = document.getElementById("bizyair-llm-model");
        const statusEl = document.getElementById("bizyair-llm-model-status");
        llmSettings = {
            url: document.getElementById("bizyair-llm-url").value.trim(),
            key: document.getElementById("bizyair-llm-key").value.trim(),
            model: modelEl ? modelEl.value.trim() : llmSettings.model
        };
        autoTagEnabled = document.getElementById("bizyair-auto-tag").checked;
        localStorage.setItem(BIZYAIR_AUTO_TAG_KEY, String(autoTagEnabled));
        saveLlmSettings();
        updateSystemPromptPreview();
        if (statusEl) {
            statusEl.textContent = "模型与独立 API 配置已保存";
            statusEl.style.color = "#16a34a";
            statusEl.dataset.preserve = "false";
        }
        showToast("✅ 独立 API 设置已保存");
    };

    window.fetchBizyairLlmModels = function() {
        fetchBizyairLlmModels();
    };

    window.loadBizyairPresetToEditor = function(type, id) {
        const item = getPromptPresetById(type, id);
        if (!item) return;
        const nameEl = document.getElementById(`bizyair-inp-${type}-name`);
        const contentEl = document.getElementById(`bizyair-inp-${type}-content`);
        if (nameEl) nameEl.value = item.name;
        if (contentEl) contentEl.value = item.content;
        presetEditorSelection[type] = item.id;
        renderPromptPresetList(type);
        updatePromptPresetEditorState(type);
    };

    window.newBizyairPromptPreset = function(type) {
        clearPromptPresetEditor(type);
        showToast("📝 已切换到新建模式");
    };

    window.toggleBizyairPromptPreset = function(type, id) {
        if (type === "char") {
            const item = promptPresets.char.find(entry => entry.id === id);
            if (item) item.active = !item.active;
        } else {
            promptPresets[type].forEach(entry => {
                entry.active = entry.id === id;
            });
        }
        savePromptPresets(type);
        renderPromptPresetList(type);
        updateSystemPromptPreview();
        updatePromptPresetEditorState(type);
    };

    window.deleteBizyairPromptPreset = function(type, id) {
        if (!confirm("删除这个预设？")) return;
        promptPresets[type] = (promptPresets[type] || []).filter(entry => entry.id !== id);
        if (type !== "char") {
            promptPresets[type] = ensureExclusivePresetState(type, promptPresets[type]);
        }
        if (presetEditorSelection[type] === id) {
            clearPromptPresetEditor(type);
        }
        savePromptPresets(type);
        renderPromptPresetList(type);
        updateSystemPromptPreview();
        updatePromptPresetEditorState(type);
        showToast("🗑️ 预设已删除");
    };

    window.saveBizyairPromptPreset = function(type) {
        const nameEl = document.getElementById(`bizyair-inp-${type}-name`);
        const contentEl = document.getElementById(`bizyair-inp-${type}-content`);
        const name = nameEl ? nameEl.value.trim() : "";
        const content = contentEl ? contentEl.value.trim() : "";
        if (!name || !content) {
            showToast("请填写预设名称和内容");
            return;
        }

        const selectedId = presetEditorSelection[type];
        const selected = getPromptPresetById(type, selectedId);
        const fallbackIdx = selected ? -1 : promptPresets[type].findIndex(entry => String(entry.name || "").trim() === name);
        let target = selected || (fallbackIdx >= 0 ? promptPresets[type][fallbackIdx] : null);
        const finalName = target ? buildUniquePromptPresetName(type, name, target.id) : name;

        if (target) {
            pushPromptPresetHistory(target);
            target.name = finalName;
            target.content = content;
            if (type !== "char") {
                target.active = true;
                promptPresets[type].forEach(entry => {
                    if (entry.id !== target.id) entry.active = false;
                });
            }
        } else {
            const created = {
                id: Date.now() + Math.floor(Math.random() * 1000),
                name: finalName,
                content,
                active: type !== "char",
                history: []
            };
            if (type !== "char") {
                promptPresets[type].forEach(entry => { entry.active = false; });
            }
            promptPresets[type].push(created);
            target = created;
        }

        presetEditorSelection[type] = target.id;
        if (nameEl) nameEl.value = target.name;
        savePromptPresets(type);
        renderPromptPresetList(type);
        updateSystemPromptPreview();
        showToast("✅ 预设已保存");
        updatePromptPresetEditorState(type);
    };

    window.saveBizyairPromptPresetAsNew = function(type) {
        const nameEl = document.getElementById(`bizyair-inp-${type}-name`);
        const contentEl = document.getElementById(`bizyair-inp-${type}-content`);
        const rawName = nameEl ? nameEl.value.trim() : "";
        const content = contentEl ? contentEl.value.trim() : "";
        if (!rawName || !content) {
            showToast("请填写预设名称和内容");
            return;
        }

        const selectedId = presetEditorSelection[type];
        const uniqueName = buildUniquePromptPresetName(type, rawName, selectedId);
        const source = getPromptPresetById(type, selectedId);
        const created = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            name: uniqueName,
            content,
            active: false,
            history: source?.history ? [...source.history] : []
        };
        promptPresets[type].push(created);
        presetEditorSelection[type] = created.id;
        if (nameEl) nameEl.value = uniqueName;
        savePromptPresets(type);
        renderPromptPresetList(type);
        updateSystemPromptPreview();
        updatePromptPresetEditorState(type);
        showToast("✅ 已另存为新预设");
    };

    window.cloneBizyairPromptPreset = function(type, id) {
        const item = getPromptPresetById(type, id);
        if (!item) return;
        const cloneName = buildUniquePromptPresetName(type, `${item.name} 副本`, null);
        const created = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            name: cloneName,
            content: item.content,
            active: false,
            history: Array.isArray(item.history) ? [...item.history] : []
        };
        promptPresets[type].push(created);
        presetEditorSelection[type] = created.id;
        const nameEl = document.getElementById(`bizyair-inp-${type}-name`);
        const contentEl = document.getElementById(`bizyair-inp-${type}-content`);
        if (nameEl) nameEl.value = created.name;
        if (contentEl) contentEl.value = created.content;
        savePromptPresets(type);
        renderPromptPresetList(type);
        updatePromptPresetEditorState(type);
        showToast("📄 已复制为新预设");
    };

    window.exportBizyairPromptPreset = function(type) {
        const selected = getPromptPresetById(type, presetEditorSelection[type]);
        const list = selected ? [selected] : (promptPresets[type] || []);
        if (list.length === 0) {
            showToast("⚠️ 当前没有可导出的预设");
            return;
        }
        const payload = {
            format: "bizyair-prompt-presets",
            created_at: new Date().toISOString(),
            promptPresets: {
                [type]: list
            }
        };
        exportPromptPresetsAsFile(type, payload, `bizyair_${type}_presets.json`);
        showToast(selected ? "📤 已导出当前预设" : "📤 已导出当前分类");
    };

    window.importBizyairPromptPreset = function(type, inputEl) {
        const file = inputEl?.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const raw = String(event.target?.result || "");
                const parsed = JSON.parse(raw);
                const incoming = Array.isArray(parsed)
                    ? parsed
                    : parsed?.promptPresets?.[type] || parsed?.[type] || [];
                const changed = mergePromptPresetType(type, incoming);
                if (!changed) {
                    throw new Error("文件里没有可导入的预设");
                }
                showToast(`✅ 已导入 ${changed} 条预设`);
            } catch (e) {
                console.error("导入预设失败:", e);
                showToast(`❌ 导入失败: ${e.message || e}`);
            } finally {
                inputEl.value = "";
            }
        };
        reader.onerror = () => {
            showToast("❌ 读取预设文件失败");
            inputEl.value = "";
        };
        reader.readAsText(file);
    };

    window.addBizyairPromptPreset = function(type) {
        window.saveBizyairPromptPreset(type);
    };

    window.captureBizyairContext = function() {
        const text = captureRecentChatContext();
        if (!text) return;
        showToast("✨ 已抓取最近两条消息");
    };

    window.closeBizyairMagicActionModal = function() {
        closeMagicActionModal();
    };

    window.closeBizyairCharacterBuildModal = function() {
        closeCharacterBuildReviewModal();
    };

    window.startBizyairChatTagFlow = function() {
        closeMagicActionModal();
        const text = captureRecentChatContext();
        if (!text) return;
        capturedContext = text;
        localStorage.setItem(BIZYAIR_CONTEXT_KEY, capturedContext);
        updateTagContextInput();
        generatePromptTags();
    };

    window.startBizyairCharacterBuildFlow = async function() {
        closeMagicActionModal();
        try {
            const context = getSillyTavernContextSafe();
            const currentCharacter = context && context.characterId !== undefined && context.characterId !== null
                ? await ensureCharacterLoaded(context, context.characterId)
                : null;
            const characterName = currentCharacter?.name || currentCharacter?.data?.name || "未命名角色";
            const text = await buildCharacterBuildContext();
            if (!text) {
                showToast("⚠️ 未获取到角色构建内容");
                return;
            }
            pendingCharacterBuild = {
                characterName,
                sourceText: text,
                profile: "",
                error: "",
                loading: true
            };
            openCharacterBuildReviewModal();
            await runCharacterBuildRequest();
        } catch (e) {
            console.error("角色构建失败:", e);
            showToast(`❌ 角色构建失败: ${e.message || e}`);
        }
    };

    window.retryBizyairCharacterBuild = async function() {
        if (!pendingCharacterBuild || pendingCharacterBuild.loading) return;
        try {
            await runCharacterBuildRequest();
            showToast("🔄 已重写角色资料");
        } catch (e) {
            console.error("角色资料重写失败:", e);
            showToast(`❌ 重写失败: ${e.message || e}`);
        }
    };

    window.saveBizyairCharacterBuild = function() {
        if (!pendingCharacterBuild || pendingCharacterBuild.loading) return;
        const modal = document.getElementById("bizyair-character-build-modal");
        const textEl = modal?.querySelector("[data-bizyair-build-text]");
        const profile = textEl ? textEl.value.trim() : String(pendingCharacterBuild.profile || "").trim();
        if (!profile) {
            showToast("⚠️ 角色资料为空，无法保存");
            return;
        }
        upsertCharacterPromptPreset(pendingCharacterBuild.characterName, profile);
        closeCharacterBuildReviewModal();
        showToast(`✅ 已更新角色资料：${pendingCharacterBuild.characterName}`);
    };

    window.generateBizyairTags = function() {
        generatePromptTags();
    };

    window.importBizyairBridgeBackup = function(inputEl) {
        const file = inputEl?.files?.[0];
        if (!file) {
            showToast("请选择 bridge 备份文件");
            return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const raw = String(event.target?.result || "");
                const data = JSON.parse(raw);
                await importBridgeBackupObject(data);
                showToast("✅ bridge 预设已导入");
            } catch (e) {
                console.error("导入 bridge 备份失败:", e);
                showToast(`❌ 导入失败: ${e.message || e}`);
            } finally {
                inputEl.value = "";
            }
        };
        reader.onerror = () => {
            showToast("❌ 读取备份文件失败");
            inputEl.value = "";
        };
        reader.readAsText(file);
    };

    window.bizyairApplyRolePrompt = function(sceneIndex) {
        const el = document.querySelector(`textarea[data-role-prompt="${sceneIndex}"]`);
        if (!el) return;
        updateBizyairPositivePrompt(el.value.trim());
        showToast("✅ 已写入正面提示词");
    };

    window.bizyairGenerateScene = async function(sceneIndex) {
        const el = document.querySelector(`textarea[data-role-prompt="${sceneIndex}"]`);
        if (!el) return;
        const promptText = el.value.trim();
        const card = el.closest(`[data-bizyair-scene="${sceneIndex}"]`);
        const locatorText = card?.getAttribute("data-bizyair-locator") || "";
        if (!promptText || !locatorText) return;
        updateBizyairPositivePrompt(promptText);
        const inserted = await insertImageTagIntoChat(locatorText, promptText);
        showToast(inserted ? "✅ 已重新插入 image 标签" : "⚠️ 未找到定位文本");
    };


    window.switchBizyairTemplate = function(templateId) {
        if (!getAllTemplates()[templateId]) return;
        bizyairTemplate = templateId;
        localStorage.setItem("bizyair_template", templateId);
        bizyairWebAppId = getWebAppIdForTemplate(templateId);
        imageParams = loadTemplateParams(templateId);

        const templateSelect = document.getElementById("bizyair-template");
        if (templateSelect) templateSelect.value = templateId;

        const webAppInput = document.getElementById("bizyair-web-app-id");
        if (webAppInput) {
            webAppInput.value = bizyairWebAppId;
            webAppInput.placeholder = `默认: ${getTemplateDef(templateId).defaultWebAppId}`;
        }

        applyParamsToUI(imageParams);
        updateSeedControls(templateId, imageParams);
        showToast(`✅ 已切换模板：${getTemplateDef(templateId).label}`);
    };

    window.toggleRandomSeed = function(checked) {
        if (!templateSupportsSeed(bizyairTemplate)) {
            const randomSeedEl = document.getElementById("bizyair-random-seed");
            if (randomSeedEl) randomSeedEl.checked = false;
            imageParams.randomSeed = false;
            saveTemplateParams(bizyairTemplate, imageParams);
            showToast("⚠️ 当前模板不支持 Seed");
            return;
        }
        imageParams.randomSeed = checked;
        saveTemplateParams(bizyairTemplate, imageParams);
        showToast(checked ? "🎲 已启用随机种子" : "🔒 已关闭随机种子");
    };

    window.deleteBizyairCustomTemplate = function(templateId) {
        if (!templateId) return;
        if (!confirm("确定删除这个自定义模板？")) return;

        const nextDefs = (customTemplateDefs || []).filter(def => def && def.id !== templateId);
        saveCustomTemplateDefs(nextDefs);
        refreshCustomTemplates();
        refreshTemplateSelect();
        renderCustomTemplateList();

        if (bizyairTemplate === templateId) {
            window.switchBizyairTemplate("legacy");
        }

        showToast("🗑️ 已删除自定义模板");
    };

    window.toggleBizyairAdvanced = function() {
        const panel = document.getElementById("bizyair-advanced-panel");
        if (!panel) return;
        panel.style.display = panel.style.display === "none" || panel.style.display === "" ? "block" : "none";
    };

    window.saveBizyairSettings = function() {
        const templateSelect = document.getElementById("bizyair-template");
        bizyairTemplate = templateSelect ? normalizeTemplateId(templateSelect.value) : bizyairTemplate;
        localStorage.setItem("bizyair_template", bizyairTemplate);

        bizyairApiKey = parseBizyairApiKeys(document.getElementById("bizyair-api-key").value).join(",");
        syncBizyairKeyPool();
        const defaultWebAppId = getTemplateDef(bizyairTemplate).defaultWebAppId;
        bizyairWebAppId = document.getElementById("bizyair-web-app-id").value.trim() || String(defaultWebAppId);
        localStorage.setItem("bizyair_api_key", bizyairApiKey);
        setWebAppIdForTemplate(bizyairTemplate, bizyairWebAppId);

        const apiKeyEl = document.getElementById("bizyair-api-key");
        if (apiKeyEl) {
            apiKeyEl.value = bizyairApiKey;
        }

        imageParams = {
            positivePrompt: document.getElementById("bizyair-pos-prompt").value,
            negativePrompt: document.getElementById("bizyair-neg-prompt").value,
            width: document.getElementById("bizyair-width").value,
            height: document.getElementById("bizyair-height").value,
            steps: document.getElementById("bizyair-steps").value,
            seed: document.getElementById("bizyair-seed").value,
            cfg: document.getElementById("bizyair-cfg").value,
            scaleBy: document.getElementById("bizyair-scale").value,
            sampler: document.getElementById("bizyair-sampler").value,
            randomSeed: templateSupportsSeed(bizyairTemplate)
                ? document.getElementById("bizyair-random-seed").checked
                : false,
            scheduler: document.getElementById("bizyair-scheduler").value.trim(),
            denoise: document.getElementById("bizyair-denoise").value,
            aspectRatio: document.getElementById("bizyair-aspect-ratio").value.trim(),
            resolution: document.getElementById("bizyair-resolution").value.trim()
        };

        updateSeedControls(bizyairTemplate, imageParams);
        saveTemplateParams(bizyairTemplate, imageParams);
        
        document.getElementById("bizyair-settings-modal").close();
        showToast("✅ 设置已保存");
        const saveHint = document.getElementById("bizyair-save-hint");
        if (saveHint) saveHint.textContent = "✅ 设置已保存";
        processPendingGenerationQueue();
    };

    function checkSidebarButton() {
        const genBtns = document.querySelectorAll(".list-group-item");
        genBtns.forEach(el => {
            if (el.innerText && (el.innerText.includes("生成图片") || el.innerText.includes("Generate Image"))) {
                if (!el.parentElement.querySelector("#bizyair-settings-btn")) {
                    const btn = document.createElement("div");
                    btn.id = "bizyair-settings-btn";
                    btn.className = "list-group-item";
                    btn.style.cursor = "pointer";
                    btn.style.display = "flex";
                    btn.style.alignItems = "center";
                    btn.innerHTML = `<span style="margin-right:0.5rem;">🖼️</span><span>BizyAir</span>`;
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        const modal = document.getElementById("bizyair-settings-modal");
                        if (modal && !modal.open) modal.showModal();
                    };
                    el.parentElement.insertBefore(btn, el);
                }
            }
        });
    }

    function replaceTextWithNodeAt(rootElement, startIdx, length, nodeToInject) {
        if (startIdx < 0 || length <= 0) return false;

        let textMap = [];
        function traverse(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                for (let i = 0; i < node.nodeValue.length; i++) {
                    textMap.push({ node: node, offset: i });
                }
            } else {
                node.childNodes.forEach(traverse);
            }
        }

        traverse(rootElement);
        const endIdx = startIdx + length - 1;
        const startEntry = textMap[startIdx];
        const endEntry = textMap[endIdx];
        if (!startEntry || !endEntry) return false;

        const range = document.createRange();
        range.setStart(startEntry.node, startEntry.offset);
        range.setEnd(endEntry.node, endEntry.offset + 1);
        range.deleteContents();
        range.insertNode(nodeToInject);
        return true;
    }

    function replaceTextWithNode(rootElement, searchText, nodeToInject) {
        let textMap = [];
        let fullText = "";

        function traverse(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                for (let i = 0; i < node.nodeValue.length; i++) {
                    textMap.push({ node: node, offset: i });
                }
                fullText += node.nodeValue;
            } else {
                node.childNodes.forEach(traverse);
            }
        }

        traverse(rootElement);
        const startIdx = fullText.lastIndexOf(searchText);
        if (startIdx === -1) return false;

        const endIdx = startIdx + searchText.length - 1;
        const startEntry = textMap[startIdx];
        const endEntry = textMap[endIdx];
        if (!startEntry || !endEntry) return false;

        const range = document.createRange();
        range.setStart(startEntry.node, startEntry.offset);
        range.setEnd(endEntry.node, endEntry.offset + 1);
        range.deleteContents();
        range.insertNode(nodeToInject);
        return true;
    }

    function getMessageStableKey(messageEl, messageIndex) {
        const container = messageEl.closest('[mesid]');
        if (container) {
            const mesid = container.getAttribute('mesid');
            if (mesid !== null && mesid !== "") {
                return `mesid_${mesid}`;
            }
        }
        const dataId = messageEl.getAttribute('data-message-id') || messageEl.getAttribute('data-mesid');
        if (dataId) return `msg_${dataId}`;
        return `idx_${messageIndex}`;
    }

    function hashText(text) {
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
        }
        return (hash >>> 0).toString(36);
    }

    function getSlotIdFromTag(description, messageKey, tagOrdinal) {
        const raw = `${messageKey}::${tagOrdinal}::${description}`;
        const stableHash = hashText(raw);
        const safeKey = `${messageKey}_${tagOrdinal}`.replace(/[^a-zA-Z0-9]/g, '');
        return `slot_${safeKey}_${stableHash}`;
    }

    function getLegacySlotIdFromTag(description, occurrenceKey) {
        const raw = `${description}::${occurrenceKey}`;
        const stableHash = hashText(raw);
        const safeKey = occurrenceKey.replace(/[^a-zA-Z0-9]/g, '');
        return `slot_${safeKey}_${stableHash}`;
    }

    function migrateGallerySlotId(item, newSlotId) {
        if (!item || item.slotId === newSlotId) return;
        const updated = { ...item, slotId: newSlotId };
        upsertGalleryItem(updated, updated.persisted);
        if (updated.persisted) {
            persistItemToDb(updated).catch((e) => {
                console.warn("更新图片 slotId 失败:", e);
            });
        }
    }

    function loadSlotSelection() {
        try {
            return JSON.parse(localStorage.getItem(SLOT_SELECTION_KEY) || "{}");
        } catch (e) {
            console.warn("读取图片选择状态失败:", e);
            return {};
        }
    }

    function saveSlotSelection() {
        localStorage.setItem(SLOT_SELECTION_KEY, JSON.stringify(slotSelection));
    }

    function setSlotSelection(slotId, itemId) {
        if (!slotId) return;
        if (itemId) {
            slotSelection[slotId] = itemId;
        } else {
            delete slotSelection[slotId];
        }
        saveSlotSelection();
    }

    function getSlotVersions(slotId) {
        return galleryData.filter(item => item && item.slotId === slotId);
    }

    function getLatestSlotItem(slotId) {
        const versions = getSlotVersions(slotId);
        if (versions.length === 0) return null;
        return versions.slice().sort((a, b) => b.timestamp - a.timestamp)[0];
    }

    function getSavedGalleryItem(slotId) {
        if (!slotId) return null;
        const selectedId = slotSelection[slotId];
        if (selectedId) {
            const selected = galleryData.find(item => item && item.id === selectedId);
            if (selected) return selected;
        }

        const latest = getLatestSlotItem(slotId);
        if (latest) {
            setSlotSelection(slotId, latest.id);
            return latest;
        }

        return null;
    }

    function normalizeSlotSelections() {
        let changed = false;
        Object.keys(slotSelection).forEach(slotId => {
            const selectedId = slotSelection[slotId];
            const selected = galleryData.find(item => item && item.id === selectedId);
            if (selected) return;
            const latest = getLatestSlotItem(slotId);
            if (latest) {
                slotSelection[slotId] = latest.id;
                changed = true;
            } else {
                delete slotSelection[slotId];
                changed = true;
            }
        });
        if (changed) saveSlotSelection();
    }

    function persistGalleryCache(stripUrls) {
        const cached = stripUrls
            ? galleryData.map(item => {
                if (!item) return item;
                if (item.persisted) return { ...item, url: "" };
                return item;
            })
            : galleryData;
        try {
            localStorage.setItem("bizyair_gallery", JSON.stringify(cached));
        } catch (e) {
            console.warn("写入本地缓存失败，尝试精简缓存:", e);
            try {
                const minimal = galleryData.map(item => item ? { ...item, url: "" } : item);
                localStorage.setItem("bizyair_gallery", JSON.stringify(minimal));
            } catch (e2) {
                console.warn("精简缓存写入失败:", e2);
            }
        }
    }

    function isGalleryViewVisible() {
        const galleryView = document.getElementById("bizyair-view-gallery");
        return !!galleryView && galleryView.style.display !== "none";
    }

    function refreshGalleryUi() {
        updateGalleryCount();
        if (isGalleryViewVisible()) {
            renderGallery();
        }
    }

    function upsertGalleryItem(item, stripUrls) {
        const normalizedItem = { ...item, persisted: !!item.persisted };
        const existingIdx = galleryData.findIndex(galleryItem =>
            galleryItem && galleryItem.id === normalizedItem.id
        );

        if (existingIdx !== -1) {
            galleryData.splice(existingIdx, 1);
        }

        galleryData.unshift(normalizedItem);
        persistGalleryCache(stripUrls);
        refreshGalleryUi();
    }

    function renderGenerateButton(wrapper, slotId, description, loadingText) {
        const isGenerating = generatingSlots.has(slotId);
        const isQueued = queuedGenerationSlots.has(slotId);
        const effectiveLoadingText = loadingText || (isGenerating ? "生成中..." : "");
        const encodedDescription = encodeURIComponent(description);
        const locator = wrapper?.getAttribute("data-bizyair-locator") || "";
        const clickAction = (isGenerating || isQueued)
            ? `window.bizyairCancelGenerate('${slotId}', this)`
            : `window.bizyairStartGenerate('${slotId}', this)`;
        const buttonText = isQueued ? "排队中...（点击取消）" : (effectiveLoadingText || '生成图片');
        const icon = (isGenerating || isQueued) ? '⏹️' : (effectiveLoadingText ? '⏳' : '🖼️');
        wrapper.className = "bizyair-inject-wrapper";
        wrapper.setAttribute("data-slot-id", slotId);
        wrapper.innerHTML = `
            <button class="bizyair-inject-btn${(effectiveLoadingText || isQueued) ? ' loading' : ''}" data-description="${encodedDescription}" data-slot-id="${slotId}" data-bizyair-locator="${encodeURIComponent(locator)}" onclick="${clickAction}">
                <span>${icon}</span> ${buttonText}
            </button>
        `;
    }

    function dequeuePendingGeneration(slotId) {
        const queueIndex = pendingGenerationQueue.findIndex(item => item.slotId === slotId);
        if (queueIndex !== -1) {
            pendingGenerationQueue.splice(queueIndex, 1);
        }
        if (scheduledQueueDispatch?.slotId === slotId) {
            if (queueDispatchTimer) {
                clearTimeout(queueDispatchTimer);
                queueDispatchTimer = null;
            }
            if (scheduledQueueDispatch.assignedKey) {
                releaseBizyairApiKeySlot(scheduledQueueDispatch.assignedKey);
                slotAssignedApiKeys.delete(slotId);
            }
            scheduledQueueDispatch = null;
        }
        queuedGenerationSlots.delete(slotId);
    }

    function scheduleQueuedGenerationDispatch(slotId, assignedKey) {
        if (queueDispatchTimer) return;

        const now = Date.now();
        const delay = Math.max(0, nextQueueDispatchAt - now);
        nextQueueDispatchAt = Math.max(nextQueueDispatchAt, now) + QUEUE_DISPATCH_INTERVAL_MS;
        scheduledQueueDispatch = { slotId, assignedKey };

        queueDispatchTimer = setTimeout(() => {
            queueDispatchTimer = null;
            const scheduled = scheduledQueueDispatch;
            scheduledQueueDispatch = null;
            if (!scheduled) {
                processPendingGenerationQueue();
                return;
            }

            const { slotId: scheduledSlotId, assignedKey: scheduledKey } = scheduled;
            if (!queuedGenerationSlots.has(scheduledSlotId)) {
                if (scheduledKey) {
                    releaseBizyairApiKeySlot(scheduledKey);
                    slotAssignedApiKeys.delete(scheduledSlotId);
                }
                processPendingGenerationQueue();
                return;
            }

            const btn = document.querySelector(`button[data-slot-id="${scheduledSlotId}"]`);
            if (!btn || generatingSlots.has(scheduledSlotId) || getSavedGalleryItem(scheduledSlotId)) {
                queuedGenerationSlots.delete(scheduledSlotId);
                if (scheduledKey) {
                    releaseBizyairApiKeySlot(scheduledKey);
                    slotAssignedApiKeys.delete(scheduledSlotId);
                }
                processPendingGenerationQueue();
                return;
            }

            queuedGenerationSlots.delete(scheduledSlotId);
            window.bizyairStartGenerate(scheduledSlotId, btn);
            processPendingGenerationQueue();
        }, delay);
    }

    function processPendingGenerationQueue() {
        if (queueDispatchTimer || scheduledQueueDispatch) return;

        while (pendingGenerationQueue.length > 0) {
            if (hasMultipleBizyairKeys()) {
                const availableKey = acquireBizyairApiKeySlot();
                if (!availableKey) return;

                const next = pendingGenerationQueue.shift();
                if (!next) {
                    releaseBizyairApiKeySlot(availableKey);
                    return;
                }

                const { slotId } = next;
                if (generatingSlots.has(slotId) || getSavedGalleryItem(slotId) || !queuedGenerationSlots.has(slotId)) {
                    releaseBizyairApiKeySlot(availableKey);
                    continue;
                }

                slotAssignedApiKeys.set(slotId, availableKey);
                scheduleQueuedGenerationDispatch(slotId, availableKey);
                return;
            }

            if (!shouldUseSingleKeyQueueLimit()) return;
            if (generatingSlots.size >= MAX_BACKGROUND_QUEUE_ACTIVE) return;

            const next = pendingGenerationQueue.shift();
            if (!next) continue;

            const { slotId } = next;
            if (generatingSlots.has(slotId) || getSavedGalleryItem(slotId) || !queuedGenerationSlots.has(slotId)) {
                continue;
            }

            scheduleQueuedGenerationDispatch(slotId, null);
            return;
        }
    }

    function enqueueGenerationRequest(slotId, description, wrapper) {
        if (generatingSlots.has(slotId) || queuedGenerationSlots.has(slotId)) return true;

        if (hasMultipleBizyairKeys()) {
            if (slotAssignedApiKeys.has(slotId)) return false;
            const reservedKey = acquireBizyairApiKeySlot();
            if (reservedKey) {
                slotAssignedApiKeys.set(slotId, reservedKey);
                return false;
            }
        } else {
            if (!shouldUseSingleKeyQueueLimit()) return false;
            if (generatingSlots.size < MAX_BACKGROUND_QUEUE_ACTIVE) return false;
        }

        pendingGenerationQueue.push({
            slotId,
            description,
            timestamp: Date.now()
        });
        queuedGenerationSlots.add(slotId);
        if (wrapper) {
            renderGenerateButton(wrapper, slotId, description);
        }
        return true;
    }

    function isAbortError(error) {
        return !!error && (error.name === "AbortError" || String(error.message || "").includes("aborted"));
    }

    function delayWithAbort(ms, signal) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                cleanup();
                resolve();
            }, ms);

            const onAbort = () => {
                cleanup();
                reject(new DOMException("Aborted", "AbortError"));
            };

            const cleanup = () => {
                clearTimeout(timer);
                if (signal) signal.removeEventListener("abort", onAbort);
            };

            if (signal) {
                if (signal.aborted) {
                    cleanup();
                    reject(new DOMException("Aborted", "AbortError"));
                    return;
                }
                signal.addEventListener("abort", onAbort, { once: true });
            }
        });
    }

    async function waitForBizyairCreateSlot(signal) {
        const previous = bizyairCreateDispatchChain.catch(() => {});
        let releaseChain = null;
        bizyairCreateDispatchChain = new Promise(resolve => {
            releaseChain = resolve;
        });

        try {
            await previous;
            const now = Date.now();
            const waitMs = Math.max(0, nextBizyairCreateAt - now);
            nextBizyairCreateAt = Math.max(nextBizyairCreateAt, now) + QUEUE_DISPATCH_INTERVAL_MS;
            if (waitMs > 0) {
                await delayWithAbort(waitMs, signal);
            }
        } finally {
            if (releaseChain) {
                releaseChain();
            }
        }
    }

    function bindResultImageEvents(resultWrapper) {
        if (!resultWrapper) return;

        const img = resultWrapper.querySelector('.bizyair-result-img');
        if (!img) return;

        const slotId = resultWrapper.dataset.slotId;
        let clickTimer = null;

        img.onclick = function() {
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
                window.bizyairRegenerate(slotId);
            } else {
                clickTimer = setTimeout(function() {
                    clickTimer = null;
                    window.bizyairOpenGallery(img.src, slotId);
                }, 500);
            }
        };
    }

    function renderImageResult(wrapper, slotId, description, imageUrl) {
        const encodedDescription = encodeURIComponent(description);
        const locator = wrapper?.getAttribute("data-bizyair-locator") || "";
        wrapper.className = "bizyair-inject-wrapper";
        wrapper.setAttribute("data-slot-id", slotId);
        wrapper.innerHTML = `
            <div class="bizyair-result-wrapper" data-slot-id="${slotId}" data-description="${encodedDescription}" data-bizyair-locator="${encodeURIComponent(locator)}">
                <img src="${imageUrl}" class="bizyair-result-img">
                <div class="bizyair-prompt-display" style="font-size:11px;color:#888;margin-top:4px;">单击查看大图，双击重新生成</div>
            </div>
        `;

        bindResultImageEvents(wrapper.querySelector('.bizyair-result-wrapper'));
    }

    function syncSavedImagesToWrappers() {
        document.querySelectorAll('.bizyair-inject-wrapper[data-slot-id]').forEach(wrapper => {
            const slotId = wrapper.dataset.slotId;
            const savedItem = getSavedGalleryItem(slotId);
            if (!savedItem) return;
            if (savedItem.locator && !wrapper.getAttribute("data-bizyair-locator")) {
                wrapper.setAttribute("data-bizyair-locator", savedItem.locator);
            }

            const currentImg = wrapper.querySelector('.bizyair-result-img');
            const resultWrapper = wrapper.querySelector('.bizyair-result-wrapper');
            const button = wrapper.querySelector('button[data-description]');
            if (button && button.classList.contains('loading')) return;

            let description = savedItem.prompt || '';
            if (resultWrapper && resultWrapper.dataset.description) {
                description = decodeURIComponent(resultWrapper.dataset.description);
            } else if (button && button.dataset.description) {
                description = decodeURIComponent(button.dataset.description);
            }

            if (!currentImg || currentImg.src !== savedItem.url) {
                renderImageResult(wrapper, slotId, description, savedItem.url);
            }
        });
    }

    function scanAndInjectButtons() {
        const messages = document.querySelectorAll('.mes_text');
        if (messages.length === 0) return;

        syncSavedImagesToWrappers();
        restoreLocatorImages();

        messages.forEach((messageEl, messageIndex) => {
            const existingTags = messageEl.querySelectorAll('[data-bizyair-tag]');
            const processedTags = new Set();
            existingTags.forEach(el => {
                processedTags.add(el.getAttribute('data-bizyair-tag'));
            });

            const text = messageEl.textContent || "";
            const imageRegex = /image##([^#]+)##/g;
            const matches = [];

            let match;
            while ((match = imageRegex.exec(text)) !== null) {
                const fullMatch = match[0];
                const description = (match[1] || "").trim();
                if (!description) continue;

                matches.push({
                    fullMatch,
                    description,
                    index: match.index,
                    length: fullMatch.length,
                    order: matches.length + 1
                });
            }

            const messageKey = getMessageStableKey(messageEl, messageIndex);

            for (let i = matches.length - 1; i >= 0; i--) {
                const current = matches[i];
                const occurrenceKey = `${messageIndex}-${current.index}-${current.length}`;
                const tagOrdinal = current.order;
                const tagKey = `${messageKey}::${tagOrdinal}::${current.fullMatch}`;

                if (processedTags.has(tagKey)) continue;

                const slotId = getSlotIdFromTag(current.description, messageKey, tagOrdinal);
                const legacySlotId = getLegacySlotIdFromTag(current.description, occurrenceKey);
                const existingWrapper = messageEl.querySelector(`.bizyair-inject-wrapper[data-slot-id="${slotId}"]`);
                let savedItem = getSavedGalleryItem(slotId);
                if (!savedItem && legacySlotId) {
                    const legacyItem = getSavedGalleryItem(legacySlotId);
                    if (legacyItem) {
                        savedItem = legacyItem;
                        migrateGallerySlotId(legacyItem, slotId);
                    }
                }

                if (existingWrapper) {
                    if (savedItem) {
                        const loadingButton = existingWrapper.querySelector('button.loading');
                        if (loadingButton) continue;

                        const currentImg = existingWrapper.querySelector('.bizyair-result-img');
                        if (!currentImg || currentImg.src !== savedItem.url) {
                            renderImageResult(existingWrapper, slotId, current.description, savedItem.url);
                        }
                    } else if (queuedGenerationSlots.has(slotId)) {
                        renderGenerateButton(existingWrapper, slotId, current.description);
                    } else if (generatingSlots.has(slotId)) {
                        renderGenerateButton(existingWrapper, slotId, current.description, "生成中...");
                    }
                    processedTags.add(tagKey);
                    continue;
                }

                const wrapper = document.createElement("span");
                wrapper.setAttribute("data-bizyair-tag", tagKey);
                wrapper.setAttribute("data-slot-id", slotId);

                if (savedItem) {
                    renderImageResult(wrapper, slotId, current.description, savedItem.url);
                } else if (queuedGenerationSlots.has(slotId)) {
                    renderGenerateButton(wrapper, slotId, current.description);
                } else if (generatingSlots.has(slotId)) {
                    renderGenerateButton(wrapper, slotId, current.description, "生成中...");
                } else {
                    renderGenerateButton(wrapper, slotId, current.description);
                }

                const replaced = replaceTextWithNodeAt(messageEl, current.index, current.length, wrapper) || replaceTextWithNode(messageEl, current.fullMatch, wrapper);
                if (!replaced) continue;

                processedTags.add(tagKey);

                if (autoGenEnabled && !savedItem && !generatingSlots.has(slotId) && !queuedGenerationSlots.has(slotId) && !autoGenScheduledSlots.has(slotId) && !autoGenTriggeredSlots.has(slotId)) {
                    autoGenScheduledSlots.add(slotId);
                    autoGenTriggeredSlots.add(slotId);
                    setTimeout(() => {
                        autoGenScheduledSlots.delete(slotId);
                        if (!autoGenEnabled || generatingSlots.has(slotId) || queuedGenerationSlots.has(slotId) || getSavedGalleryItem(slotId)) return;
                        const autoBtn = document.querySelector(`button[data-slot-id="${slotId}"]`);
                        if (!autoBtn) {
                            autoGenTriggeredSlots.delete(slotId);
                            return;
                        }
                        window.bizyairStartGenerate(slotId, autoBtn);
                    }, 300);
                }
            }
        });
    }

    function shouldRunScanForMutations(mutations) {
        for (const mutation of mutations) {
            const target = mutation.target;
            if (target instanceof Element) {
                if (target.matches('.mes_text') || target.closest('.mes_text')) {
                    return true;
                }
            }

            for (const node of mutation.addedNodes) {
                if (!(node instanceof Element)) continue;
                if (node.matches('.mes_text') || node.querySelector('.mes_text')) {
                    return true;
                }
            }
        }
        return false;
    }

    window.bizyairStartGenerate = function(slotId, explicitBtn) {
        const btn = explicitBtn || document.querySelector(`button[data-slot-id="${slotId}"]`);
        if (!btn) return;

        const description = btn.dataset.description ? decodeURIComponent(btn.dataset.description) : "";
        const wrapper = btn.closest('.bizyair-inject-wrapper');

        if (queuedGenerationSlots.has(slotId)) {
            return;
        }

        if (generatingSlots.has(slotId)) {
            window.bizyairCancelGenerate(slotId, btn);
            return;
        }

        if (enqueueGenerationRequest(slotId, description, wrapper)) {
            return;
        }

        autoGenScheduledSlots.delete(slotId);
        dequeuePendingGeneration(slotId);
        if (hasMultipleBizyairKeys() && !slotAssignedApiKeys.has(slotId)) {
            const assignedKey = acquireBizyairApiKeySlot();
            if (!assignedKey) {
                enqueueGenerationRequest(slotId, description, wrapper);
                return;
            }
            slotAssignedApiKeys.set(slotId, assignedKey);
        }
        generatingSlots.add(slotId);
        const controller = new AbortController();
        slotAbortControllers.set(slotId, controller);

        if (wrapper) {
            renderGenerateButton(wrapper, slotId, description, "生成中...（点击取消）");
        }
        
        autoGenerateImage(slotId, description, controller.signal, slotAssignedApiKeys.get(slotId) || bizyairApiKeys[0] || bizyairApiKey);
    }

    window.bizyairCancelGenerate = function(slotId, explicitBtn) {
        const btn = explicitBtn || document.querySelector(`button[data-slot-id="${slotId}"]`);
        const description = btn?.dataset?.description ? decodeURIComponent(btn.dataset.description) : "";
        const wrapper = btn?.closest('.bizyair-inject-wrapper')
            || document.querySelector(`.bizyair-inject-wrapper[data-slot-id="${slotId}"]`);

        if (queuedGenerationSlots.has(slotId)) {
            dequeuePendingGeneration(slotId);
            const assignedKey = slotAssignedApiKeys.get(slotId);
            if (assignedKey) {
                releaseBizyairApiKeySlot(assignedKey);
                slotAssignedApiKeys.delete(slotId);
            }
            autoGenScheduledSlots.delete(slotId);
            if (wrapper) {
                renderGenerateButton(wrapper, slotId, description);
            }
            showToast("⏹️ 已取消排队");
            return;
        }

        const controller = slotAbortControllers.get(slotId);
        if (controller && !controller.signal.aborted) {
            controller.abort();
        }

        slotAbortControllers.delete(slotId);
        generatingSlots.delete(slotId);
        autoGenScheduledSlots.delete(slotId);

        if (wrapper) {
            renderGenerateButton(wrapper, slotId, description);
        }

        showToast("⏹️ 已取消生成");
        processPendingGenerationQueue();
    }

    async function autoGenerateImage(slotId, description, signal, apiKey) {
        const templateId = bizyairTemplate;
        let wasCancelled = false;
        
        try {
            const result = await generateImage(description, templateId, signal, apiKey);
            console.log("BizyAir result:", result);
            
            if (result && result.outputs && Array.isArray(result.outputs) && result.outputs.length > 0) {
                const imageUrl = getFinalImage(result.outputs, templateId);
                if (imageUrl) {
                    if (apiKey) markBizyairApiKeySuccess(apiKey);
                    showImageResult(slotId, imageUrl);
                } else {
                    throw new Error("无法获取图片地址");
                }
            } else if (result && result.request_id) {
                const wrapper = document.querySelector(`.bizyair-inject-wrapper[data-slot-id="${slotId}"]`);
                if (wrapper) {
                    renderGenerateButton(wrapper, slotId, description, "等待图片...（点击取消）");
                }
                await pollForResult(result.request_id, slotId, templateId, signal, description, apiKey);
            } else {
                console.log("BizyAir response:", result);
                throw new Error("未获取到图片地址");
            }
        } catch (error) {
            if (isAbortError(error)) {
                wasCancelled = true;
            }
            console.error("BizyAir Error:", error);
            if (!wasCancelled && apiKey && hasMultipleBizyairKeys()) {
                markBizyairApiKeyFailure(apiKey);
            }
            if (!wasCancelled) {
                const btn = document.querySelector(`button[data-slot-id="${slotId}"]`);
                if (btn) {
                    btn.innerHTML = `<span>❌</span> 生成失败`;
                    btn.classList.remove("loading");
                }
                showToast("❌ 生成失败: " + error.message);
            }
        } finally {
            slotAbortControllers.delete(slotId);
            generatingSlots.delete(slotId);
            autoGenScheduledSlots.delete(slotId);
            const assignedKey = slotAssignedApiKeys.get(slotId);
            if (assignedKey) {
                releaseBizyairApiKeySlot(assignedKey);
                slotAssignedApiKeys.delete(slotId);
            }

            if (wasCancelled) {
                const wrapper = document.querySelector(`.bizyair-inject-wrapper[data-slot-id="${slotId}"]`);
                if (wrapper) {
                    renderGenerateButton(wrapper, slotId, description);
                }
            }
            processPendingGenerationQueue();
        }
    }

    function showImageResult(slotId, imageUrl) {
        const wrapper = document.querySelector(`.bizyair-inject-wrapper[data-slot-id="${slotId}"]`);
        if (!wrapper) return;

        const button = wrapper.querySelector(`button[data-slot-id="${slotId}"]`);
        const resultWrapper = wrapper.querySelector('.bizyair-result-wrapper');
        let description = "";

        if (button && button.dataset.description) {
            description = decodeURIComponent(button.dataset.description);
        } else if (resultWrapper && resultWrapper.dataset.description) {
            description = decodeURIComponent(resultWrapper.dataset.description);
        }

        let locator = wrapper.getAttribute("data-bizyair-locator") || "";
        if (!locator && button && button.dataset.bizyairLocator) {
            locator = decodeURIComponent(button.dataset.bizyairLocator);
        }
        if (!locator && resultWrapper && resultWrapper.dataset.bizyairLocator) {
            locator = decodeURIComponent(resultWrapper.dataset.bizyairLocator);
        }

        renderImageResult(wrapper, slotId, description, imageUrl);
        if (locator) {
            wrapper.setAttribute("data-bizyair-locator", locator);
        }
        saveToGallery(imageUrl, description, slotId, locator || null);

        showToast("✅ 图片生成成功");
    }

    let db = null;
    const DB_NAME = 'bizyair_gallery_db';
    const STORE_NAME = 'images';
    
    async function initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                db = request.result;
                resolve(db);
            };
            request.onupgradeneeded = (event) => {
                const database = event.target.result;
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
        });
    }

    async function requestPersistentStorage() {
        try {
            if (navigator.storage && navigator.storage.persist) {
                const granted = await navigator.storage.persist();
                console.log(granted ? "已申请持久化存储" : "未授予持久化存储");
            }
        } catch (e) {
            console.warn("申请持久化存储失败:", e);
        }
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error || new Error("读取图片失败"));
            reader.readAsDataURL(blob);
        });
    }

    function createThumbnailFromBlob(blob, maxEdge = 320, quality = 0.72) {
        return new Promise((resolve, reject) => {
            const objectUrl = URL.createObjectURL(blob);
            const img = new Image();

            const cleanup = () => {
                URL.revokeObjectURL(objectUrl);
            };

            img.onload = () => {
                try {
                    const maxSide = Math.max(img.width, img.height) || 1;
                    const scale = Math.min(1, maxEdge / maxSide);
                    const targetWidth = Math.max(1, Math.round(img.width * scale));
                    const targetHeight = Math.max(1, Math.round(img.height * scale));

                    const canvas = document.createElement("canvas");
                    canvas.width = targetWidth;
                    canvas.height = targetHeight;

                    const ctx = canvas.getContext("2d", { alpha: false });
                    if (!ctx) throw new Error("无法创建缩略图画布");

                    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
                    const thumbDataUrl = canvas.toDataURL("image/jpeg", quality);
                    cleanup();
                    resolve(thumbDataUrl);
                } catch (e) {
                    cleanup();
                    reject(e);
                }
            };

            img.onerror = () => {
                cleanup();
                reject(new Error("缩略图生成失败"));
            };

            img.src = objectUrl;
        });
    }

    let legacyThumbMigrationRunning = false;
    let legacyThumbMigrationScheduled = false;

    function hasThumbUrl(item) {
        return !!(item && typeof item.thumbUrl === "string" && item.thumbUrl.trim());
    }

    async function backfillLegacyGalleryThumbnails() {
        if (legacyThumbMigrationRunning) return;

        const targetIds = galleryData
            .filter(item => item && item.id && item.url && !hasThumbUrl(item))
            .map(item => item.id);

        if (targetIds.length === 0) return;

        legacyThumbMigrationRunning = true;
        try {
            let updatedCount = 0;

            for (let i = 0; i < targetIds.length; i++) {
                const itemId = targetIds[i];
                const index = galleryData.findIndex(item => item && item.id === itemId);
                if (index === -1) continue;
                const current = galleryData[index];
                if (!current || !current.url || hasThumbUrl(current)) continue;

                try {
                    const response = await fetch(current.url, { mode: 'cors' });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const blob = await response.blob();
                    const thumbUrl = await createThumbnailFromBlob(blob);

                    if (!thumbUrl) continue;

                    const updatedItem = { ...current, thumbUrl };
                    galleryData[index] = updatedItem;

                    if (updatedItem.persisted) {
                        try {
                            await persistItemToDb(updatedItem);
                        } catch (e) {
                            console.warn("回写旧图缩略图到数据库失败:", e);
                        }
                    }

                    updatedCount++;

                    if (updatedCount % 8 === 0) {
                        persistGalleryCache(true);
                        if (isGalleryViewVisible()) renderGallery();
                        await sleep(12);
                    }
                } catch (e) {
                    console.warn("旧图缩略图补齐失败，跳过:", e);
                }
            }

            if (updatedCount > 0) {
                persistGalleryCache(true);
                refreshGalleryUi();
                console.log(`[BizyAir] 旧图库缩略图补齐完成: ${updatedCount}/${targetIds.length}`);
            }
        } finally {
            legacyThumbMigrationRunning = false;
        }
    }

    function scheduleLegacyThumbBackfill() {
        if (legacyThumbMigrationScheduled) return;
        legacyThumbMigrationScheduled = true;

        setTimeout(() => {
            legacyThumbMigrationScheduled = false;
            backfillLegacyGalleryThumbnails().catch((e) => {
                console.warn("旧图库缩略图补齐任务异常:", e);
            });
        }, 300);
    }

    async function persistItemToDb(item) {
        if (!db) await initDB();
        if (!db) throw new Error("数据库不可用");

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            store.put(item);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error || new Error("数据库事务中止"));
        });
    }
    
    async function saveToGallery(url, prompt, slotId, locator = null) {
        const uniqueSuffix = Math.random().toString(36).slice(2, 8);
        const itemId = slotId
            ? `${slotId}_${Date.now()}_${uniqueSuffix}`
            : `gal_${Date.now()}_${uniqueSuffix}`;
        const previewItem = {
            id: itemId,
            slotId: slotId,
            locator: locator,
            url: url,
            thumbUrl: url,
            prompt: prompt,
            timestamp: Date.now(),
            persisted: false
        };

        if (slotId) {
            setSlotSelection(slotId, itemId);
        }

        upsertGalleryItem(previewItem, false);

        try {
            const response = await fetch(url, { mode: 'cors' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            const base64 = await blobToDataUrl(blob);
            let thumbUrl = "";

            try {
                thumbUrl = await createThumbnailFromBlob(blob);
            } catch (thumbError) {
                console.warn("生成缩略图失败，回退使用原图:", thumbError);
            }

            const item = {
                id: itemId,
                slotId: slotId,
                locator: locator,
                url: base64,
                thumbUrl: thumbUrl || base64,
                prompt: prompt,
                timestamp: previewItem.timestamp,
                persisted: false
            };

            // 先把 base64 写入内存/本地缓存，避免 URL 过期
            upsertGalleryItem(item, false);

            if (slotId) {
                setSlotSelection(slotId, itemId);
            }

            try {
                await persistItemToDb(item);
                upsertGalleryItem({ ...item, persisted: true }, true);
            } catch (dbError) {
                console.error("保存到数据库失败:", dbError);
                showToast("⚠️ 本地持久化失败，已保留临时缓存");
                upsertGalleryItem(item, false);
            }
        } catch (e) {
            console.error("保存图片失败:", e);
            showToast("⚠️ 保存图片失败，可能是链接已过期");
        }
    }
    
    async function loadGalleryFromDB() {
        if (!db) {
            try {
                await initDB();
            } catch (e) {
                console.warn("初始化图库数据库失败，回退到 localStorage:", e);
            }
        }

        if (db) {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            return new Promise((resolve) => {
                request.onsuccess = () => {
                    const items = request.result;
                    if (items && items.length > 0) {
                        galleryData = items
                            .map(item => ({ ...item, persisted: true }))
                            .sort((a, b) => b.timestamp - a.timestamp);
                    } else {
                        galleryData = loadGalleryFromLocalCache();
                    }
                    normalizeSlotSelections();
                    refreshGalleryUi();
                    scheduleLegacyThumbBackfill();
                    resolve();
                };
                request.onerror = () => {
                    galleryData = loadGalleryFromLocalCache();
                    normalizeSlotSelections();
                    refreshGalleryUi();
                    scheduleLegacyThumbBackfill();
                    resolve();
                };
            });
        }

        galleryData = loadGalleryFromLocalCache();
        normalizeSlotSelections();
        refreshGalleryUi();
        scheduleLegacyThumbBackfill();
    }

    function loadGalleryFromLocalCache() {
        try {
            const cached = JSON.parse(localStorage.getItem("bizyair_gallery") || "[]");
        return cached
                .filter(item => item && item.url)
                .map(item => ({ ...item, persisted: false }))
                .sort((a, b) => b.timestamp - a.timestamp);
        } catch (e) {
            console.error("读取本地画廊缓存失败:", e);
            return [];
        }
    }
    
    function updateGalleryCount() {
        const modal = document.getElementById("bizyair-settings-modal");
        if (modal) {
            const tab = modal.querySelector('.bizyair-tab[data-tab="gallery"]');
            if (tab) {
                const total = galleryData.length;
                const cached = galleryData.filter(item =>
                    item && (item.persisted || (typeof item.url === "string" && item.url.startsWith("data:")))
                ).length;
                tab.innerHTML = `🖼️ 画廊 (${total} | 缓存 ${cached})`;
            }
        }
    }

    async function pollForResult(taskId, slotId, templateId, signal, description, apiKey) {
        const btn = document.querySelector(`button[data-slot-id="${slotId}"]`);
        const maxAttempts = 60;
        let attempts = 0;
        
        while (attempts < maxAttempts) {
            await delayWithAbort(2000, signal);
            
            try {
                const res = await fetch(`https://api.bizyair.cn/w/v1/webapp/task/openapi/query?task_id=${taskId}`, {
                    headers: {
                        'Authorization': `Bearer ${apiKey || bizyairApiKeys[0] || bizyairApiKey}`
                    },
                    signal
                });
                const data = await res.json();
                
                console.log("Poll response:", data);
                
                if (data.status === 'Success' && data.outputs && Array.isArray(data.outputs) && data.outputs.length > 0) {
                    const imageUrl = getFinalImage(data.outputs, templateId);
                    if (!imageUrl) continue;
                    if (apiKey) markBizyairApiKeySuccess(apiKey);
                    showImageResult(slotId, imageUrl);
                    return;
                } else if (data.status === 'failed') {
                    throw new Error(data.error || "生成失败");
                }
            } catch (e) {
                if (isAbortError(e)) throw e;
                console.error("Polling error:", e);
            }
            
            attempts++;
        }
        
        if (btn) {
            btn.innerHTML = `<span>⏱️</span> 超时`;
            btn.classList.remove("loading");
        }
        showToast("⏱️ 等待超时");
    }

    function getStoredParams(templateId) {
        return loadTemplateParams(templateId || bizyairTemplate);
    }

    function syncGeneratedSeed(templateId, seedValue) {
        const normalized = normalizeTemplateId(templateId || bizyairTemplate);
        if (!templateSupportsSeed(normalized)) return;

        if (normalizeTemplateId(bizyairTemplate) === normalized) {
            imageParams.seed = seedValue;
            const seedInput = document.getElementById("bizyair-seed");
            if (seedInput) seedInput.value = String(seedValue);
        }

        const latest = loadTemplateParams(normalized);
        latest.seed = seedValue;
        saveTemplateParams(normalized, latest);
    }

    function getCurrentParams(stored, templateId) {
        const activeTemplate = normalizeTemplateId(templateId || bizyairTemplate);
        const randomSeedEnabled = templateSupportsSeed(activeTemplate)
            ? normalizeRandomSeedValue(stored.randomSeed)
            : false;
        const seedValue = randomSeedEnabled
            ? Math.floor(Math.random() * 2147483647)
            : normalizeSeedValue(stored.seed, 101);

        const template = getTemplateDef(activeTemplate);
        const params = template.buildParams(stored, seedValue);
        return {
            params,
            seedValue,
            randomSeedEnabled,
            activeTemplate,
        };
    }

    function getFinalImage(outputs, templateId) {
        if (!outputs || !Array.isArray(outputs) || outputs.length === 0) return null;
        const template = getTemplateDef(templateId || bizyairTemplate);
        const fromEnd = template.outputIndexFromEnd || 1;
        const index = outputs.length - fromEnd;
        const safeIndex = index >= 0 ? index : outputs.length - 1;
        return outputs[safeIndex].object_url;
    }

    async function generateImage(description, templateId, signal, apiKey) {
        const activeTemplate = normalizeTemplateId(templateId || bizyairTemplate);
        const stored = getStoredParams(activeTemplate);
        const built = getCurrentParams(stored, activeTemplate);
        const params = built.params;
        const template = getTemplateDef(activeTemplate);
        const positiveKey = template.positivePromptKey;
        const negativeKey = template.negativePromptKey;
        const suppressPreviewOutput = template.suppressPreviewOutput !== undefined ? template.suppressPreviewOutput : true;

        if (built.randomSeedEnabled) {
            syncGeneratedSeed(activeTemplate, built.seedValue);
            console.info(`[BizyAir] template=${activeTemplate} random seed=${built.seedValue}`);
        }

        const seedEntries = Object.entries(params).filter(([key]) => /seed/i.test(key));
        if (seedEntries.length > 0) {
            console.info("[BizyAir] API seed keys:", Object.fromEntries(seedEntries));
        }

        if (positiveKey) {
            const positiveParts = [stored.positivePrompt, description]
                .map(value => (typeof value === "string" ? value.trim() : ""))
                .filter(Boolean);
            params[positiveKey] = positiveParts.join(", ");
        }
        if (negativeKey) {
            params[negativeKey] = stored.negativePrompt || "";
        }

        const templateWebAppId = getWebAppIdForTemplate(activeTemplate);
        const parsedWebAppId = parseInt(templateWebAppId, 10);
        const webAppId = Number.isFinite(parsedWebAppId)
            ? parsedWebAppId
            : getTemplateDef(activeTemplate).defaultWebAppId;

        await waitForBizyairCreateSlot(signal);
        
        const response = await fetch('https://api.bizyair.cn/w/v1/webapp/task/openapi/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey || bizyairApiKeys[0] || bizyairApiKey}`
            },
            signal,
            body: JSON.stringify({
                web_app_id: webAppId,
                suppress_preview_output: suppressPreviewOutput,
                input_values: params
            })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.message || result.error || "API 请求失败");
        }
        
        return result;
    }

    window.bizyairOpenGallery = function(url, slotId) {
        const gallery = document.createElement("dialog");
        gallery.id = "bizyair-gallery";

        const versions = slotId ? getSlotVersions(slotId).slice().sort((a, b) => b.timestamp - a.timestamp) : [];
        let currentIndex = 0;
        if (versions.length > 0) {
            const selectedId = slotSelection[slotId];
            const selectedIdx = selectedId ? versions.findIndex(v => v.id === selectedId) : -1;
            if (selectedIdx >= 0) {
                currentIndex = selectedIdx;
            } else {
                const byUrl = versions.findIndex(v => v.url === url);
                currentIndex = byUrl >= 0 ? byUrl : 0;
            }
        }

        const img = document.createElement("img");
        img.style.cssText = "max-width:95%;max-height:95%;object-fit:contain;";
        img.src = versions.length > 0 ? versions[currentIndex].url : url;

        const badge = document.createElement("div");
        badge.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.6);color:#fff;padding:6px 10px;border-radius:12px;font-size:12px;";
        badge.textContent = versions.length > 1 ? `第 ${currentIndex + 1} / ${versions.length} 张（点击图片切换）` : "点击空白关闭";

        img.onclick = (e) => {
            e.stopPropagation();
            if (versions.length <= 1) return;
            currentIndex = (currentIndex + 1) % versions.length;
            img.src = versions[currentIndex].url;
            badge.textContent = `第 ${currentIndex + 1} / ${versions.length} 张（点击图片切换）`;
        };

        const closeGallery = () => {
            gallery.remove();
            if (slotId && versions.length > 0) {
                const chosen = versions[currentIndex];
                if (chosen) {
                    setSlotSelection(slotId, chosen.id);
                    syncSavedImagesToWrappers();
                }
            }
            document.removeEventListener("keydown", escHandler);
        };

        const escHandler = (event) => {
            if (event.key === "Escape") {
                closeGallery();
            }
        };

        document.addEventListener("keydown", escHandler);
        gallery.onclick = closeGallery;

        gallery.appendChild(img);
        gallery.appendChild(badge);
        document.body.appendChild(gallery);
        gallery.showModal();
    };

    window.bizyairRegenerate = function(slotId) {
        const wrapper = document.querySelector(`.bizyair-inject-wrapper[data-slot-id="${slotId}"]`);
        const resultWrapper = wrapper ? wrapper.querySelector('.bizyair-result-wrapper') : null;
        if (!wrapper || !resultWrapper) return;

        const encodedDescription = resultWrapper.dataset.description || "";
        const description = encodedDescription ? decodeURIComponent(encodedDescription) : "";

        renderGenerateButton(wrapper, slotId, description, "重新生成中...");
        setTimeout(() => window.bizyairStartGenerate(slotId), 0);
    };

    function initObserver() {
        if (messageObserver) return;

        let trailingTimer = null;
        let lastScanAt = 0;
        const throttleMs = 80;

        const scheduleScan = () => {
            const now = Date.now();
            const elapsed = now - lastScanAt;

            if (elapsed >= throttleMs) {
                lastScanAt = now;
                scanAndInjectButtons();
                return;
            }

            if (trailingTimer) return;
            trailingTimer = setTimeout(() => {
                trailingTimer = null;
                lastScanAt = Date.now();
                scanAndInjectButtons();
            }, throttleMs - elapsed);
        };
        
        messageObserver = new MutationObserver((mutations) => {
            if (!shouldRunScanForMutations(mutations)) return;
            scheduleScan();
        });
        
        messageObserver.observe(document.body, { childList: true, subtree: true });

        if (!scanHeartbeatTimer) {
            // Fallback self-healing scan in case some streaming DOM writes bypass observer timing.
            scanHeartbeatTimer = setInterval(() => {
                scanAndInjectButtons();
            }, 500);
        }
    }
    
    let galleryEditMode = false;
    let gallerySelected = new Set();
    
    function renderGallery() {
        const grid = document.getElementById("bizyair-gallery-grid");
        if (!grid) return;

        if (galleryData.length === 0) {
            grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;" class="bizyair-hint">暂无图片</div>';
            return;
        }

        grid.innerHTML = galleryData.map((item, idx) => {
            const displayUrl = item.thumbUrl || item.url;
            const selected = gallerySelected.has(idx);
            return `
            <div class="bizyair-gallery-item${selected ? ' selected' : ''}" onclick="${galleryEditMode ? `window.toggleGallerySelect(${idx})` : `window.openBizyairImage(${idx})`}">
                <img src="${displayUrl}" loading="lazy" decoding="async" style="${galleryEditMode ? 'opacity:0.5;' : ''}">
                ${galleryEditMode ? `<div style="position:absolute;top:5px;right:5px;width:22px;height:22px;border-radius:50%;background:${selected ? 'var(--bz-accent)' : 'var(--bz-bg-hover)'};display:flex;align-items:center;justify-content:center;color:white;font-size:12px;">${selected ? '✓' : ''}</div>` : ''}
                ${!galleryEditMode ? `
                <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.75);display:flex;justify-content:center;gap:4px;padding:5px;opacity:0;transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0">
                    <button class="bizyair-btn bizyair-btn-sm bizyair-btn-primary" style="padding:3px 8px;" onclick="event.stopPropagation();window.downloadBizyairImage(${idx})">下载</button>
                    <button class="bizyair-btn bizyair-btn-sm bizyair-btn-danger" style="padding:3px 8px;" onclick="event.stopPropagation();window.deleteBizyairImage(${idx})">删除</button>
                </div>` : ''}
            </div>
        `;
        }).join('');
    }
    
    window.toggleGallerySelect = function(idx) {
        if (gallerySelected.has(idx)) {
            gallerySelected.delete(idx);
        } else {
            gallerySelected.add(idx);
        }
        
        const countEl = document.getElementById('bizyair-selected-count');
        if (countEl) countEl.innerText = gallerySelected.size;
        
        renderGallery();
    }
    
    window.toggleGalleryEditMode = function() {
        galleryEditMode = !galleryEditMode;
        gallerySelected.clear();

        const btn = document.getElementById('bizyair-edit-btn');
        if (btn) {
            btn.textContent = galleryEditMode ? '完成' : '编辑';
            if (galleryEditMode) {
                btn.classList.remove('bizyair-btn-secondary');
                btn.classList.add('bizyair-btn-primary');
            } else {
                btn.classList.remove('bizyair-btn-primary');
                btn.classList.add('bizyair-btn-secondary');
            }
        }

        const actionsDiv = document.getElementById('bizyair-gallery-actions');
        if (actionsDiv) {
            actionsDiv.style.display = galleryEditMode ? 'flex' : 'none';
        }

        renderGallery();
    }
    
    window.deleteSelectedGallery = async function() {
        if (gallerySelected.size === 0) return showToast('请先选择要删除的图片');
        
        if (!confirm(`确定删除选中的 ${gallerySelected.size} 张图片？`)) return;
        
        const sortedIdx = Array.from(gallerySelected).sort((a, b) => b - a);
        
        const removedItems = [];
        if (db) {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            sortedIdx.forEach(idx => {
                const item = galleryData[idx];
                if (item && item.id) {
                    store.delete(item.id);
                }
                if (item) removedItems.push(item);
            });
        }
        
        sortedIdx.forEach(idx => {
            if (!removedItems.length) {
                const item = galleryData[idx];
                if (item) removedItems.push(item);
            }
            galleryData.splice(idx, 1);
        });
        
        localStorage.setItem("bizyair_gallery", JSON.stringify(galleryData));
        removedItems.forEach(item => {
            if (item && item.slotId) {
                const selectedId = slotSelection[item.slotId];
                if (selectedId === item.id) {
                    const latest = getLatestSlotItem(item.slotId);
                    setSlotSelection(item.slotId, latest ? latest.id : null);
                }
            }
        });
        
        gallerySelected.clear();
        galleryEditMode = false;
        
        document.getElementById('bizyair-edit-btn').innerHTML = '✏️ 编辑';
        document.getElementById('bizyair-edit-btn').style.background = '';
        document.getElementById('bizyair-gallery-actions').style.display = 'none';
        
        refreshGalleryUi();
        showToast(`🗑️ 已删除 ${sortedIdx.length} 张图片`);
    }
    
    window.openBizyairGallery = function() {
        loadGalleryFromDB().then(() => {
            createSettingsModal();
            document.getElementById("bizyair-settings-modal").showModal();
            window.switchBizyairTab('gallery');
        });
    }
    
    window.openBizyairImage = function(idx) {
        const item = galleryData[idx];
        if (!item) return;
        window.bizyairOpenGallery(item.url, item.slotId || null);
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function triggerImageDownload(item, fallbackName) {
        const fileName = `bizyair_${item.id || fallbackName}.png`;
        let objectUrl = null;

        try {
            if (item.url && item.url.startsWith('data:')) {
                const a = document.createElement("a");
                a.href = item.url;
                a.download = fileName;
                a.rel = "noopener noreferrer";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                return true;
            }

            const response = await fetch(item.url, { mode: 'cors' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            objectUrl = URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = objectUrl;
            a.download = fileName;
            a.rel = "noopener noreferrer";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            return true;
        } catch (e) {
            console.error("下载失败:", e);
            try {
                window.open(item.url, '_blank', 'noopener,noreferrer');
            } catch (_) {}
            return false;
        } finally {
            if (objectUrl) {
                setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
            }
        }
    }

    async function downloadGalleryItems(items, label) {
        if (!items || items.length === 0) {
            showToast("没有可下载的图片");
            return;
        }

        showToast(`📥 开始下载 ${items.length} 张图片...`);
        let okCount = 0;

        for (let i = 0; i < items.length; i++) {
            const success = await triggerImageDownload(items[i], `item_${i + 1}`);
            if (success) okCount++;

            if (isTouchDevice) {
                await sleep(700);
            } else {
                await sleep(180);
            }
        }

        if (okCount === items.length) {
            showToast(`✅ ${label}下载完成`);
        } else {
            showToast(`⚠️ ${label}完成（成功 ${okCount}/${items.length}）`);
        }
    }
    
    window.downloadBizyairImage = async function(idx) {
        const item = galleryData[idx];
        if (!item) return;

        const success = await triggerImageDownload(item, `single_${idx + 1}`);
        showToast(success ? "✅ 下载成功" : "⚠️ 已尝试下载，请检查浏览器下载权限");
    }
    
    window.deleteBizyairImage = async function(idx) {
        if (!confirm("确定删除这张图片？")) return;
        
        const item = galleryData[idx];
        if (item && item.id) {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            store.delete(item.id);
        }
        
        galleryData.splice(idx, 1);
        localStorage.setItem("bizyair_gallery", JSON.stringify(galleryData));
        if (item && item.slotId) {
            const selectedId = slotSelection[item.slotId];
            if (selectedId === item.id) {
                const latest = getLatestSlotItem(item.slotId);
                setSlotSelection(item.slotId, latest ? latest.id : null);
            }
        }
        refreshGalleryUi();
    }
    
    window.downloadSelectedGallery = async function() {
        if (gallerySelected.size === 0) return showToast('请先选择要下载的图片');

        const selectedItems = Array.from(gallerySelected)
            .sort((a, b) => a - b)
            .map(idx => galleryData[idx])
            .filter(Boolean);

        await downloadGalleryItems(selectedItems, '选中图片');
    }

    window.downloadAllGalleryImages = async function() {
        await downloadGalleryItems(galleryData, '全部图片');
    }
    
    window.clearAllGallery = function() {
        if (!confirm("确定清空所有图片？此操作不可恢复！")) return;
        
        if (db) {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            store.clear();
        }
        
        galleryData = [];
        localStorage.setItem("bizyair_gallery", JSON.stringify(galleryData));
        slotSelection = {};
        saveSlotSelection();
        refreshGalleryUi();
        showToast("🗑️ 画廊已清空");
    }

    function initMagicWandTrigger() {
        const trigger = document.getElementById("extensionsMenuButton");
        if (!trigger || trigger.dataset.bizyairMagicBound === "true") return;

        let lastTouchAt = 0;

        trigger.addEventListener("dblclick", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (llmAbortController) {
                const canceled = cancelBizyairLlmRequest();
                if (canceled) {
                    showToast(`已中断独立 API 生成${llmInFlightLabel ? ` (${llmInFlightLabel})` : ""}`);
                    return;
                }
            }
            openMagicActionModal();
        });

        trigger.addEventListener("touchend", (event) => {
            const now = Date.now();
            if ((now - lastTouchAt) <= 500) {
                lastTouchAt = 0;
                event.preventDefault();
                event.stopPropagation();
                if (llmAbortController) {
                    const canceled = cancelBizyairLlmRequest();
                    if (canceled) {
                        showToast(`已中断独立 API 生成${llmInFlightLabel ? ` (${llmInFlightLabel})` : ""}`);
                        return;
                    }
                }
                openMagicActionModal();
                return;
            }
            lastTouchAt = now;
        }, { passive: false });

        trigger.dataset.bizyairMagicBound = "true";
    }

    function init() {
        injectStyles();
        createToast();
        createSettingsModal();

        requestPersistentStorage();
        
        initDB().then(() => {
            loadGalleryFromDB().then(() => {
                scanAndInjectButtons();
            });
        });
        
        setInterval(() => {
            checkSidebarButton();
            initMagicWandTrigger();
            bindAutoTagAfterMessageListener();
        }, 1000);
        
        checkSidebarButton();
        initObserver();
        initLocatorRestoreObserver();
        initMagicWandTrigger();
        bindAutoTagAfterMessageListener();
        
        console.log("BizyAir Image Generator 插件已加载");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
