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
    
    let bizyairApiKey = localStorage.getItem("bizyair_api_key") || "";
    let bizyairWebAppId = localStorage.getItem("bizyair_web_app_id") || "44306";
    let autoGenEnabled = localStorage.getItem("bizyair_auto_gen") === "true";
    let tempLocators = {};
    let messageObserver = null;
    let galleryData = [];
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    
    let imageParams = JSON.parse(localStorage.getItem("bizyair_params") || JSON.stringify({
        positivePrompt: "",
        negativePrompt: "blurry, noisy, messy, lowres, jpeg, artifacts, ill, distorted, malformed, text, watermark, signature, username, artist name, logo",
        width: 832,
        height: 1216,
        steps: 20,
        seed: 101,
        cfg: 8,
        sampler: "euler_ancestral",
        scaleBy: 1.2,
        randomSeed: false
    }));

    const defaultParams = {
        "93:CLIPTextEncode.text": "",
        "55:CLIPTextEncode.text": imageParams.negativePrompt,
        "47:EmptyLatentImage.width": parseInt(imageParams.width),
        "47:EmptyLatentImage.height": parseInt(imageParams.height),
        "47:EmptyLatentImage.batch_size": 1,
        "89:FaceDetailer.steps": parseInt(imageParams.steps),
        "89:FaceDetailer.seed": parseInt(imageParams.seed),
        "89:FaceDetailer.cfg": parseFloat(imageParams.cfg),
        "89:FaceDetailer.sampler_name": imageParams.sampler,
        "89:FaceDetailer.scheduler": imageParams.scheduler,
        "74:LatentUpscaleBy.scale_by": 1.5
    };

    function injectStyles() {
        const styleId = "bizyair-plugin-style";
        if (document.getElementById(styleId)) return;
        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = `
            .bizyair-inject-btn {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                background: linear-gradient(90deg, #8b5cf6, #a855f7);
                color: white;
                border: none;
                padding: 4px 12px;
                border-radius: 12px;
                font-size: 12px;
                font-weight: bold;
                cursor: pointer;
                margin-left: 8px;
                vertical-align: middle;
                transition: transform 0.2s, opacity 0.2s;
            }
            .bizyair-inject-btn:hover {
                transform: scale(1.05);
                opacity: 0.9;
            }
            .bizyair-inject-btn.loading {
                background: #ef4444;
                cursor: pointer;
                animation: bizyair-pulse 1.5s infinite;
            }
            @keyframes bizyair-pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.7; }
            }
            .bizyair-result-img {
                max-width: 300px;
                max-height: 300px;
                border-radius: 8px;
                border: 2px solid #a855f7;
                box-shadow: 0 4px 15px rgba(0,0,0,0.5);
                display: block;
                margin-top: 8px;
                cursor: pointer;
                animation: bizyair-fade-in 0.5s ease;
            }
            .bizyair-result-img:hover {
                filter: brightness(1.1);
                border-color: #fff;
            }
            @keyframes bizyair-fade-in {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            #bizyair-toast {
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: #10b981;
                color: white;
                padding: 10px 20px;
                border-radius: 20px;
                font-size: 14px;
                font-weight: bold;
                z-index: 1000000;
                box-shadow: 0 4px 10px rgba(0,0,0,0.3);
                opacity: 0;
                transition: opacity 0.3s;
                pointer-events: none;
            }
            #bizyair-toast.show { opacity: 1; top: 30px; }
            
            #bizyair-settings-modal {
                display: none;
                position: fixed;
                z-index: 99999;
                left: 0;
                top: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(0,0,0,0.7);
                align-items: center;
                justify-content: center;
            }
            #bizyair-settings-modal.show { display: flex; }
            .bizyair-modal-content {
                background: #1e1e1e;
                border: 1px solid #333;
                border-radius: 10px;
                width: 90%;
                max-width: 500px;
                max-height: 90vh;
                overflow-y: auto;
                padding: 20px;
                color: #ddd;
                font-family: "Microsoft YaHei", sans-serif;
            }
            
            /* 移动端适配 */
            @media screen and (max-width: 768px) {
                #bizyair-settings-modal { padding: 0 !important; }
                #bizyair-settings-modal .bizyair-modal-content {
                    width: 100vw !important;
                    max-width: 100vw !important;
                    height: 100vh !important;
                    max-height: 100vh !important;
                    border-radius: 0 !important;
                    padding: 10px !important;
                }
                #bizyair-settings-modal .bizyair-modal-header {
                    padding: 10px 0 !important;
                    font-size: 16px !important;
                }
                #bizyair-settings-modal .bizyair-tabs {
                    display: flex !important;
                    margin-bottom: 10px !important;
                }
                #bizyair-settings-modal .bizyair-tab {
                    flex: 1 !important;
                    padding: 12px 10px !important;
                    font-size: 14px !important;
                }
                #bizyair-settings-modal .bizyair-input, 
                #bizyair-settings-modal select {
                    font-size: 16px !important;
                    padding: 12px 8px !important;
                }
                #bizyair-settings-modal .bizyair-view {
                    padding: 5px !important;
                    padding-bottom: 50px !important;
                }
                #bizyair-settings-modal #bizyair-gallery-grid {
                    grid-template-columns: repeat(2, 1fr) !important;
                    gap: 8px !important;
                    padding-bottom: 50px !important;
                }
            }
            .bizyair-modal-header {
                font-size: 18px;
                font-weight: bold;
                margin-bottom: 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .bizyair-input {
                width: 100%;
                background: #2a2a2a;
                border: 1px solid #444;
                color: #ccc;
                padding: 10px;
                border-radius: 4px;
                margin-bottom: 15px;
                box-sizing: border-box;
            }
            .bizyair-btn {
                padding: 10px 20px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: bold;
                margin-right: 10px;
            }
            .bizyair-btn-primary { background: #8b5cf6; color: white; }
            .bizyair-btn-secondary { background: #444; color: #aaa; }
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

    function createSettingsModal() {
        if (document.getElementById("bizyair-settings-modal")) return;
        
        const style = document.createElement("style");
        style.textContent = `
            @media screen and (max-width: 768px) {
                #bizyair-settings-modal .bizyair-modal-content { width: 100vw !important; height: 100vh !important; max-width: 100vw !important; max-height: 100vh !important; border-radius: 0 !important; }
                #bizyair-settings-modal .bizyair-tabs { flex-wrap: wrap; }
                #bizyair-settings-modal .bizyair-tab { flex: none; width: auto; padding: 10px 15px; }
                #bizyair-settings-modal .bizyair-view { padding: 10px; }
                #bizyair-settings-modal .bizyair-input, #bizyair-settings-modal select { font-size: 16px; padding: 12px; }
            }
        `;
        document.head.appendChild(style);
        
        const div = document.createElement("div");
        div.id = "bizyair-settings-modal";
        div.innerHTML = `
            <div class="bizyair-modal-content">
                <div class="bizyair-modal-header">
                    <span>BizyAir 设置</span>
                    <span style="cursor:pointer;font-size:24px;line-height:1;" onclick="document.getElementById('bizyair-settings-modal').classList.remove('show')">&times;</span>
                </div>
                
                <div class="bizyair-tabs" style="display:flex;background:#252525;border-bottom:1px solid #333;">
                    <div class="bizyair-tab active" data-tab="settings" onclick="window.switchBizyairTab('settings')" style="flex:1;text-align:center;padding:12px;cursor:pointer;color:#a855f7;border-bottom:2px solid #a855f7;">⚙️ 设置</div>
                    <div class="bizyair-tab" data-tab="gallery" onclick="window.switchBizyairTab('gallery')" style="flex:1;text-align:center;padding:12px;cursor:pointer;color:#888;">🖼️ 画廊</div>
                </div>
                
                <div id="bizyair-view-settings" class="bizyair-view" style="padding:15px;overflow-y:auto;max-height:calc(90vh - 100px);">
                    <div style="margin-bottom:15px;padding:10px;background:#2a2a2a;border-radius:4px;">
                        <label style="display:block; margin-bottom:5px; color:#aaa; font-size:12px;">API Key</label>
                        <input type="text" id="bizyair-api-key" class="bizyair-input" value="${bizyairApiKey}" placeholder="输入你的 API Key">
                        
                        <label style="display:block; margin-bottom:5px; color:#aaa; font-size:12px;">Web App ID</label>
                        <input type="text" id="bizyair-web-app-id" class="bizyair-input" value="${bizyairWebAppId}" placeholder="默认: 44306">
                    </div>
                    
                    <div style="margin: 15px 0; padding: 10px; background: #2a2a2a; border-radius: 4px;">
                        <label style="display:flex; align-items:center; gap: 10px; cursor: pointer;">
                            <input type="checkbox" id="bizyair-auto-gen" ${autoGenEnabled ? 'checked' : ''} onchange="window.toggleAutoGen(this.checked)">
                            <span style="color:#ddd; font-size:13px;">检测到 image## 时自动生成图片</span>
                        </label>
                    </div>
                    
                    <h3 style="color:#a855f7;margin:15px 0 10px;font-size:14px;">🎨 生图参数</h3>
                    
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                        <div>
                            <label style="color:#aaa;font-size:11px;">宽度</label>
                            <input type="number" id="bizyair-width" class="bizyair-input" value="${imageParams.width}" style="margin-bottom:0;">
                        </div>
                        <div>
                            <label style="color:#aaa;font-size:11px;">高度</label>
                            <input type="number" id="bizyair-height" class="bizyair-input" value="${imageParams.height}" style="margin-bottom:0;">
                        </div>
                        <div>
                            <label style="color:#aaa;font-size:11px;">步数</label>
                            <input type="number" id="bizyair-steps" class="bizyair-input" value="${imageParams.steps}" style="margin-bottom:0;">
                        </div>
                        <div>
                            <label style="color:#aaa;font-size:11px;">Seed</label>
                            <input type="number" id="bizyair-seed" class="bizyair-input" value="${imageParams.seed}" style="margin-bottom:0;">
                        </div>
                        <div>
                            <label style="color:#aaa;font-size:11px;">Scale</label>
                            <input type="number" step="0.1" id="bizyair-scale" class="bizyair-input" value="${imageParams.scaleBy}" style="margin-bottom:0;">
                        </div>
                        <div>
                            <label style="color:#aaa;font-size:11px;">CFG</label>
                            <input type="number" step="0.1" id="bizyair-cfg" class="bizyair-input" value="${imageParams.cfg}" style="margin-bottom:0;">
                        </div>
                    </div>
                    
                    <div style="margin-top:10px;">
                        <label style="color:#aaa;font-size:11px;">Sampler</label>
                        <select id="bizyair-sampler" class="bizyair-input" style="margin-bottom:0;">
                            <option value="euler" ${imageParams.sampler === 'euler' ? 'selected' : ''}>euler</option>
                            <option value="euler_ancestral" ${imageParams.sampler === 'euler_ancestral' ? 'selected' : ''}>euler_ancestral</option>
                            <option value="dpm_2" ${imageParams.sampler === 'dpm_2' ? 'selected' : ''}>dpm_2</option>
                            <option value="dpm_2_ancestral" ${imageParams.sampler === 'dpm_2_ancestral' ? 'selected' : ''}>dpm_2_ancestral</option>
                            <option value="dpmpp_2m" ${imageParams.sampler === 'dpmpp_2m' ? 'selected' : ''}>dpmpp_2m</option>
                            <option value="uni_pc" ${imageParams.sampler === 'uni_pc' ? 'selected' : ''}>uni_pc</option>
                        </select>
                    </div>
                    
                    <div style="margin-top:10px;">
                        <label style="color:#aaa;font-size:11px;">正面提示词</label>
                        <textarea id="bizyair-pos-prompt" class="bizyair-input" rows="2" style="margin-bottom:0;"></textarea>
                    </div>
                    
                    <div style="margin-top:10px;">
                        <label style="color:#aaa;font-size:11px;">负面提示词</label>
                        <textarea id="bizyair-neg-prompt" class="bizyair-input" rows="2" style="margin-bottom:0;">${imageParams.negativePrompt}</textarea>
                    </div>
                    
                    <div style="margin: 15px 0; padding: 10px; background: #2a2a2a; border-radius: 4px;">
                        <label style="display:flex; align-items:center; gap: 10px; cursor: pointer;">
                            <input type="checkbox" id="bizyair-random-seed" ${imageParams.randomSeed ? 'checked' : ''} onchange="window.toggleRandomSeed(this.checked)">
                            <span style="color:#ddd; font-size:13px;">每次生图随机种子</span>
                        </label>
                    </div>
                    
                    <button class="bizyair-btn bizyair-btn-primary" style="width:100%;margin-top:10px;" onclick="window.saveBizyairSettings()">💾 保存设置</button>
                </div>
                
                <div id="bizyair-view-gallery" class="bizyair-view" style="display:none;padding:15px;overflow-y:auto;max-height:calc(90vh - 100px);">
                    <div style="display:flex;gap:10px;margin-bottom:15px;">
                        <button class="bizyair-btn bizyair-btn-secondary" style="flex:1;" onclick="window.downloadAllGalleryImages()">📥 全部下载</button>
                        <button id="bizyair-edit-btn" class="bizyair-btn" style="flex:1;" onclick="window.toggleGalleryEditMode()">✏️ 编辑</button>
                        <button class="bizyair-btn" style="background:#ef4444;color:white;flex:1;" onclick="window.clearAllGallery()">🗑️ 清空</button>
                    </div>
                    <div id="bizyair-gallery-actions" style="display:none;gap:10px;margin-bottom:15px;padding:10px;background:#2a2a2a;border-radius:4px;">
                        <span style="color:#aaa;font-size:12px;flex:1;display:flex;align-items:center;">已选 <span id="bizyair-selected-count" style="color:#a855f7;margin:0 4px;">0</span> 张</span>
                        <button class="bizyair-btn bizyair-btn-primary" style="padding:6px 12px;font-size:12px;" onclick="window.downloadSelectedGallery()">下载选中</button>
                        <button class="bizyair-btn" style="background:#ef4444;color:white;padding:6px 12px;font-size:12px;" onclick="window.deleteSelectedGallery()">删除选中</button>
                        <button class="bizyair-btn" style="padding:6px 12px;font-size:12px;" onclick="window.toggleGalleryEditMode()">取消</button>
                    </div>
                    <div id="bizyair-gallery-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;"></div>
                </div>
            </div>
        `;
        document.body.appendChild(div);
        
        window.switchBizyairTab = function(tab) {
            document.querySelectorAll('.bizyair-tab').forEach(t => {
                t.classList.remove('active');
                t.style.color = '#888';
                t.style.borderBottom = 'none';
            });
            document.querySelector(`.bizyair-tab[data-tab="${tab}"]`).classList.add('active');
            document.querySelector(`.bizyair-tab[data-tab="${tab}"]`).style.color = '#a855f7';
            document.querySelector(`.bizyair-tab[data-tab="${tab}"]`).style.borderBottom = '2px solid #a855f7';
            
            document.getElementById('bizyair-view-settings').style.display = tab === 'settings' ? 'block' : 'none';
            document.getElementById('bizyair-view-gallery').style.display = tab === 'gallery' ? 'block' : 'none';
            
            if (tab === 'gallery') {
                renderGallery();
            }
        };
        
        document.getElementById("bizyair-view-gallery").style.display = "none";
    }

    window.toggleAutoGen = function(checked) {
        autoGenEnabled = checked;
        localStorage.setItem("bizyair_auto_gen", checked);
        showToast(checked ? "⚡ 自动生图已开启" : "⏸️ 自动生图已关闭");
    };

    window.toggleRandomSeed = function(checked) {
        imageParams.randomSeed = checked;
        localStorage.setItem("bizyair_params", JSON.stringify(imageParams));
        showToast(checked ? "🎲 已启用随机种子" : "🔒 已关闭随机种子");
    };

    window.saveBizyairSettings = function() {
        bizyairApiKey = document.getElementById("bizyair-api-key").value.trim();
        bizyairWebAppId = document.getElementById("bizyair-web-app-id").value.trim() || "44306";
        localStorage.setItem("bizyair_api_key", bizyairApiKey);
        localStorage.setItem("bizyair_web_app_id", bizyairWebAppId);
        
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
            randomSeed: document.getElementById("bizyair-random-seed").checked
        };
        localStorage.setItem("bizyair_params", JSON.stringify(imageParams));
        
        document.getElementById("bizyair-settings-modal").classList.remove("show");
        showToast("✅ 设置已保存");
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
                        document.getElementById("bizyair-settings-modal").classList.add("show");
                    };
                    el.parentElement.insertBefore(btn, el);
                }
            }
        });
    }

    function injectNodeAfterText(rootElement, searchText, nodeToInject) {
        let textMap = [];
        let fullText = "";
        
        function traverse(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                for (let i = 0; i < node.nodeValue.length; i++) {
                    textMap.push({ node: node, offset: i, char: node.nodeValue[i] });
                }
                fullText += node.nodeValue;
            } else {
                node.childNodes.forEach(traverse);
            }
        }
        
        traverse(rootElement);
        const idx = fullText.lastIndexOf(searchText);
        if (idx === -1) return false;
        
        const endIdx = idx + searchText.length;
        if (endIdx >= textMap.length) {
            rootElement.appendChild(nodeToInject);
        } else {
            const mapEntry = textMap[endIdx - 1];
            const targetNode = mapEntry.node;
            const splitPoint = mapEntry.offset + 1;
            
            if (splitPoint < targetNode.nodeValue.length) {
                const remainderNode = targetNode.splitText(splitPoint);
                targetNode.parentNode.insertBefore(nodeToInject, remainderNode);
            } else {
                const nextSibling = targetNode.nextSibling;
                if (nextSibling) {
                    targetNode.parentNode.insertBefore(nodeToInject, nextSibling);
                } else {
                    targetNode.parentNode.appendChild(nodeToInject);
                }
            }
        }
        return true;
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

    function getSlotIdFromTag(description, occurrenceKey) {
        const raw = `${description}::${occurrenceKey}`;
        let hash = 2166136261;
        for (let i = 0; i < raw.length; i++) {
            hash ^= raw.charCodeAt(i);
            hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
        }
        const stableHash = (hash >>> 0).toString(36);
        const safeKey = occurrenceKey.replace(/[^a-zA-Z0-9]/g, '');
        return `slot_${safeKey}_${stableHash}`;
    }

    function getSavedGalleryItem(slotId) {
        return galleryData.find(item => item && (item.slotId === slotId || item.id === slotId)) || null;
    }

    function persistGalleryCache(stripUrls) {
        const cached = stripUrls
            ? galleryData.map(item => ({ ...item, url: "" }))
            : galleryData;
        localStorage.setItem("bizyair_gallery", JSON.stringify(cached));
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
        const existingIdx = galleryData.findIndex(galleryItem =>
            galleryItem && (galleryItem.id === item.id || (item.slotId && galleryItem.slotId === item.slotId))
        );

        if (existingIdx !== -1) {
            galleryData.splice(existingIdx, 1);
        }

        galleryData.unshift(item);
        persistGalleryCache(stripUrls);
        refreshGalleryUi();
    }

    function renderGenerateButton(wrapper, slotId, description, loadingText) {
        const encodedDescription = encodeURIComponent(description);
        wrapper.className = "bizyair-inject-wrapper";
        wrapper.setAttribute("data-slot-id", slotId);
        wrapper.innerHTML = `
            <button class="bizyair-inject-btn${loadingText ? ' loading' : ''}" data-description="${encodedDescription}" data-slot-id="${slotId}" onclick="window.bizyairStartGenerate('${slotId}', this)">
                <span>${loadingText ? '⏳' : '🖼️'}</span> ${loadingText || '生成图片'}
            </button>
        `;
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
                    window.bizyairOpenGallery(img.src);
                }, 500);
            }
        };
    }

    function renderImageResult(wrapper, slotId, description, imageUrl) {
        const encodedDescription = encodeURIComponent(description);
        wrapper.className = "bizyair-inject-wrapper";
        wrapper.setAttribute("data-slot-id", slotId);
        wrapper.innerHTML = `
            <div class="bizyair-result-wrapper" data-slot-id="${slotId}" data-description="${encodedDescription}">
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
                    length: fullMatch.length
                });
            }

            for (let i = matches.length - 1; i >= 0; i--) {
                const current = matches[i];
                const occurrenceKey = `${messageIndex}-${current.index}-${current.length}`;
                const tagKey = `${current.fullMatch}@${occurrenceKey}`;

                if (processedTags.has(tagKey)) continue;

                const slotId = getSlotIdFromTag(current.description, occurrenceKey);
                const existingWrapper = messageEl.querySelector(`.bizyair-inject-wrapper[data-slot-id="${slotId}"]`);
                const savedItem = getSavedGalleryItem(slotId);

                if (existingWrapper) {
                    if (savedItem) {
                        const loadingButton = existingWrapper.querySelector('button.loading');
                        if (loadingButton) continue;

                        const currentImg = existingWrapper.querySelector('.bizyair-result-img');
                        if (!currentImg || currentImg.src !== savedItem.url) {
                            renderImageResult(existingWrapper, slotId, current.description, savedItem.url);
                        }
                    }
                    processedTags.add(tagKey);
                    continue;
                }

                const wrapper = document.createElement("span");
                wrapper.setAttribute("data-bizyair-tag", tagKey);
                wrapper.setAttribute("data-slot-id", slotId);

                if (savedItem) {
                    renderImageResult(wrapper, slotId, current.description, savedItem.url);
                } else {
                    renderGenerateButton(wrapper, slotId, current.description);
                }

                const replaced = replaceTextWithNodeAt(messageEl, current.index, current.length, wrapper) || replaceTextWithNode(messageEl, current.fullMatch, wrapper);
                if (!replaced) continue;

                processedTags.add(tagKey);

                if (autoGenEnabled && !savedItem) {
                    setTimeout(() => window.bizyairStartGenerate(slotId), 300);
                }
            }
        });
    }

    window.bizyairStartGenerate = function(slotId, explicitBtn) {
        const btn = explicitBtn || document.querySelector(`button[data-slot-id="${slotId}"]`);
        if (!btn) return;
        
        const description = decodeURIComponent(btn.dataset.description);
        
        btn.innerHTML = `<span>⏳</span> 生成中...`;
        btn.classList.add("loading");
        btn.onclick = function() {
            btn.innerHTML = `<span>🖼️</span> 生成图片`;
            btn.classList.remove("loading");
            btn.onclick = function() { window.bizyairStartGenerate(slotId, btn); };
            showToast("⏹️ 已取消生成");
        };
        
        autoGenerateImage(slotId, description);
    }

    async function autoGenerateImage(slotId, description) {
        const btn = document.querySelector(`button[data-slot-id="${slotId}"]`);
        if (!btn) return;
        
        try {
            const result = await generateImage(description);
            console.log("BizyAir result:", result);
            
            if (result && result.outputs && Array.isArray(result.outputs) && result.outputs.length > 0) {
                const imageUrl = getFinalImage(result.outputs);
                if (imageUrl) {
                    showImageResult(slotId, imageUrl);
                } else {
                    throw new Error("无法获取图片地址");
                }
            } else if (result && result.request_id) {
                btn.innerHTML = `<span>⏳</span> 等待图片...`;
                await pollForResult(result.request_id, slotId);
            } else {
                console.log("BizyAir response:", result);
                throw new Error("未获取到图片地址");
            }
        } catch (error) {
            console.error("BizyAir Error:", error);
            btn.innerHTML = `<span>❌</span> 生成失败`;
            btn.classList.remove("loading");
            showToast("❌ 生成失败: " + error.message);
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

        renderImageResult(wrapper, slotId, description, imageUrl);
        saveToGallery(imageUrl, description, slotId);

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
    
    async function saveToGallery(url, prompt, slotId) {
        const itemId = slotId || 'gal_' + Date.now();
        const previewItem = {
            id: itemId,
            slotId: slotId,
            url: url,
            prompt: prompt,
            timestamp: Date.now()
        };

        upsertGalleryItem(previewItem, false);

        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const reader = new FileReader();
            reader.onloadend = async function() {
                const base64 = reader.result;
                const item = {
                    id: itemId,
                    slotId: slotId,
                    url: base64,
                    prompt: prompt,
                    timestamp: previewItem.timestamp
                };
                
                try {
                    if (!db) await initDB();
                    if (db) {
                        const transaction = db.transaction([STORE_NAME], 'readwrite');
                        const store = transaction.objectStore(STORE_NAME);
                        store.put(item);
                    }
                    upsertGalleryItem(item, true);
                } catch (dbError) {
                    console.error("保存到数据库失败:", dbError);
                    upsertGalleryItem(item, false);
                }
            };
            reader.readAsDataURL(blob);
        } catch (e) {
            console.error("保存图片失败:", e);
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
                        galleryData = items.sort((a, b) => b.timestamp - a.timestamp);
                    } else {
                        galleryData = loadGalleryFromLocalCache();
                    }
                    refreshGalleryUi();
                    resolve();
                };
                request.onerror = () => {
                    galleryData = loadGalleryFromLocalCache();
                    refreshGalleryUi();
                    resolve();
                };
            });
        }

        galleryData = loadGalleryFromLocalCache();
        refreshGalleryUi();
    }

    function loadGalleryFromLocalCache() {
        try {
            const cached = JSON.parse(localStorage.getItem("bizyair_gallery") || "[]");
            return cached
                .filter(item => item && item.url)
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
            if (tab) tab.innerHTML = `🖼️ 画廊 (${galleryData.length})`;
        }
    }

    async function pollForResult(taskId, slotId) {
        const btn = document.querySelector(`button[data-slot-id="${slotId}"]`);
        const maxAttempts = 60;
        let attempts = 0;
        
        while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            try {
                const res = await fetch(`https://api.bizyair.cn/w/v1/webapp/task/openapi/query?task_id=${taskId}`, {
                    headers: {
                        'Authorization': `Bearer ${bizyairApiKey}`
                    }
                });
                const data = await res.json();
                
                console.log("Poll response:", data);
                
                if (data.status === 'Success' && data.outputs && Array.isArray(data.outputs) && data.outputs.length > 0) {
                    const imageUrl = getFinalImage(data.outputs);
                    if (!imageUrl) continue;
                    showImageResult(slotId, imageUrl);
                    return;
                } else if (data.status === 'failed') {
                    throw new Error(data.error || "生成失败");
                }
            } catch (e) {
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

    function getCurrentParams() {
        const stored = JSON.parse(localStorage.getItem("bizyair_params") || JSON.stringify(imageParams));
        const seedValue = stored.randomSeed
            ? Math.floor(Math.random() * 1000000000000000)
            : parseInt(stored.seed);

        return {
            "27:KSampler.seed": seedValue,
            "27:KSampler.steps": parseInt(stored.steps),
            "27:KSampler.sampler_name": stored.sampler,
            "61:CM_SDXLExtendedResolution.resolution": `${stored.width}x${stored.height}`,
            "69:DF_Latent_Scale_by_ratio.modifier": parseFloat(stored.scaleBy),
            "31:CLIPTextEncode.text": stored.positivePrompt,
            "32:CLIPTextEncode.text": stored.negativePrompt,
            "54:EmptyLatentImage.batch_size": 1,
            "57:dynamicThresholdingFull.mimic_scale": parseFloat(stored.cfg)
        };
    }

    function getFinalImage(outputs) {
        if (!outputs || !Array.isArray(outputs) || outputs.length === 0) return null;
        if (outputs.length === 1) return outputs[0].object_url;
        
        const lastIndex = outputs.length - 2;
        if (lastIndex < 0) return outputs[outputs.length - 1].object_url;
        
        return outputs[lastIndex].object_url;
    }

    async function generateImage(description) {
        const params = getCurrentParams();
        const stored = JSON.parse(localStorage.getItem("bizyair_params") || JSON.stringify(imageParams));
        params["31:CLIPTextEncode.text"] = (stored.positivePrompt || "") + (description ? ", " + description : "");
        
        const response = await fetch('https://api.bizyair.cn/w/v1/webapp/task/openapi/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${bizyairApiKey}`
            },
            body: JSON.stringify({
                web_app_id: parseInt(bizyairWebAppId),
                suppress_preview_output: false,
                input_values: params
            })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.message || "API 请求失败");
        }
        
        return result;
    }

    window.bizyairOpenGallery = function(url) {
        const gallery = document.createElement("div");
        gallery.id = "bizyair-gallery";
        gallery.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0,0,0,0.95);
            z-index: 1000000;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
        `;
        gallery.innerHTML = `<img src="${url}" style="max-width:95%;max-height:95%;object-fit:contain;">`;
        gallery.onclick = () => gallery.remove();
        document.body.appendChild(gallery);
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
        
        let scanTimer = null;
        
        messageObserver = new MutationObserver((mutations) => {
            if (scanTimer) clearTimeout(scanTimer);
            scanTimer = setTimeout(() => {
                scanAndInjectButtons();
            }, 500);
        });
        
        messageObserver.observe(document.body, { childList: true, subtree: true });
    }
    
    let galleryEditMode = false;
    let gallerySelected = new Set();
    
    function renderGallery() {
        const grid = document.getElementById("bizyair-gallery-grid");
        if (!grid) return;
        
        if (galleryData.length === 0) {
            grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#666;padding:40px;">暂无图片</div>';
            return;
        }
        
        grid.innerHTML = galleryData.map((item, idx) => `
            <div class="bizyair-gallery-item" style="position:relative;aspect-ratio:1;background:#000;border-radius:8px;overflow:hidden;cursor:pointer;${gallerySelected.has(idx) ? 'border:2px solid #a855f7;' : ''}" onclick="${galleryEditMode ? `window.toggleGallerySelect(${idx})` : `window.openBizyairImage(${idx})`}">
                <img src="${item.url}" loading="lazy" style="width:100%;height:100%;object-fit:cover;${galleryEditMode ? 'opacity:0.5;' : ''}">
                ${galleryEditMode ? `<div style="position:absolute;top:5px;right:5px;width:24px;height:24px;border-radius:50%;background:${gallerySelected.has(idx) ? '#a855f7' : '#666'};display:flex;align-items:center;justify-content:center;color:white;font-size:14px;">${gallerySelected.has(idx) ? '✓' : ''}</div>` : ''}
                ${!galleryEditMode ? `
                <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.7);display:flex;justify-content:center;gap:5px;padding:5px;opacity:0;transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0">
                    <button style="background:#3b82f6;color:white;padding:4px 8px;font-size:11px;border:none;border-radius:4px;cursor:pointer;" onclick="event.stopPropagation();window.downloadBizyairImage(${idx})">下载</button>
                    <button style="background:#ef4444;color:white;padding:4px 8px;font-size:11px;border:none;border-radius:4px;cursor:pointer;" onclick="event.stopPropagation();window.deleteBizyairImage(${idx})">删除</button>
                </div>` : ''}
            </div>
        `).join('');
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
            btn.innerHTML = galleryEditMode ? '✅ 完成' : '✏️ 编辑';
            btn.style.background = galleryEditMode ? '#a855f7' : '';
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
        
        if (db) {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            sortedIdx.forEach(idx => {
                const item = galleryData[idx];
                if (item && item.id) {
                    store.delete(item.id);
                }
            });
        }
        
        sortedIdx.forEach(idx => {
            galleryData.splice(idx, 1);
        });
        
        localStorage.setItem("bizyair_gallery", JSON.stringify(galleryData));
        
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
            document.getElementById("bizyair-settings-modal").classList.add("show");
            window.switchBizyairTab('gallery');
        });
    }
    
    window.openBizyairImage = function(idx) {
        const item = galleryData[idx];
        if (!item) return;
        window.bizyairOpenGallery(item.url);
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
        refreshGalleryUi();
        showToast("🗑️ 画廊已清空");
    }

    function init() {
        injectStyles();
        createToast();
        createSettingsModal();
        
        initDB().then(() => {
            loadGalleryFromDB().then(() => {
                scanAndInjectButtons();
            });
        });
        
        setInterval(checkSidebarButton, 1000);
        
        checkSidebarButton();
        initObserver();
        
        console.log("BizyAir Image Generator 插件已加载");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
