// 全局变量
let currentPdfDoc = null;
let currentPageNumber = 1;
let numPages = 0;
let scale = 1.0;
let isRendering = false;
let isDualPageMode = false; // 默认单页模式
let isRecordMode = true;   // 默认录音模式
let notesData = [];         // 存储当前PDF的备注数据
let currentPdfFilename = ''; // 当前打开的PDF文件名
let longPressTimer = null;  // 长按定时器
let isLongPressTriggered = false; // 是否已触发长按
let mediaRecorder = null;   // MediaRecorder 实例
let recordedChunks = [];    // 存储录音数据块
let currentAudio = null;    // 当前播放的音频元素
let currentPlayingMarker = null; // 当前正在播放的录音标记
let isDraggingPopup = false; // 是否正在拖动悬浮框

// DOM 元素
const homePage = document.getElementById('home-page');
const readerPage = document.getElementById('reader-page');
const fileList = document.getElementById('file-list');
const fileInput = document.getElementById('file-input');
const uploadBtn = document.getElementById('upload-btn');
const backToHomeBtn = document.getElementById('back-to-home');

const toolbar = document.getElementById('toolbar');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const fitWidthBtn = document.getElementById('fit-width');
const fitHeightBtn = document.getElementById('fit-height');
const toggleViewModeBtn = document.getElementById('toggle-view-mode');
const modeToggle = document.getElementById('mode-toggle'); // 滑块开关

const pdfContainer = document.getElementById('pdf-container');
const pdfCanvas = document.getElementById('pdf-canvas');
const notesListPanel = document.getElementById('notes-list-panel');
const notesList = document.getElementById('notes-list');
const currentPageEl = document.getElementById('current-page');
const totalPagesEl = document.getElementById('total-pages');

// --- 初始化 ---
document.addEventListener('DOMContentLoaded', () => {
    showHomePage();
    setupEventListeners();
});

// --- 页面切换逻辑 ---

function showHomePage() {
    readerPage.style.display = 'none';
    homePage.style.display = 'block';
    loadFileList();
}

async function showReaderPage(filename) {
    homePage.style.display = 'none';
    readerPage.style.display = 'flex';
    // 从文件名中提取 ID
    const fileId = filename.replace('.pdf', '');
    currentPdfFilename = filename; // 保持文件名用于后续操作
    setDefaultMode(); // 设置默认为录音模式
    loadPdf(filename);
}

// --- 主页逻辑 ---

function setupEventListeners() {
    uploadBtn.addEventListener('click', handleFileUpload);
    backToHomeBtn.addEventListener('click', showHomePage);
    
    // 工具栏按钮事件
    prevPageBtn.addEventListener('click', () => changePage(-1));
    nextPageBtn.addEventListener('click', () => changePage(1));
    zoomInBtn.addEventListener('click', () => zoomPdf(1.1));
    zoomOutBtn.addEventListener('click', () => zoomPdf(0.9));
    fitWidthBtn.addEventListener('click', () => fitPdfToWidth());
    fitHeightBtn.addEventListener('click', () => fitPdfToHeight());
    toggleViewModeBtn.addEventListener('click', toggleViewMode);
    modeToggle.addEventListener('change', toggleMode); // 滑块开关事件

    // PDF容器事件 (用于添加备注/录音)
    pdfContainer.addEventListener('mousedown', handleCanvasMouseDown);
    pdfContainer.addEventListener('mouseup', handleCanvasMouseUp);
    pdfContainer.addEventListener('mouseleave', handleCanvasMouseLeave);
}

async function loadFileList() {
    try {
        const response = await fetch('/files');
        const files = await response.json();
        fileList.innerHTML = '';
        files.forEach(fileInfo => {
            const fileItem = document.createElement('div');
            fileItem.className = 'pdf-item';
            
            // 创建缩略图 (这里简化处理，实际应用中需要后端生成或前端使用pdf.js生成)
            const thumbnail = document.createElement('div');
            thumbnail.className = 'pdf-thumbnail';
            thumbnail.style.backgroundColor = '#ddd';
            thumbnail.textContent = 'PDF';
            thumbnail.style.display = 'flex';
            thumbnail.style.alignItems = 'center';
            thumbnail.style.justifyContent = 'center';
            thumbnail.style.color = '#666';
            
            const link = document.createElement('span');
            link.className = 'pdf-link';
            // 使用 ID 作为显示名称，避免文件名乱码
            link.textContent = fileInfo.id; 
            link.addEventListener('click', () => showReaderPage(fileInfo.filename));
            
            // 创建删除按钮
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.textContent = '删除';
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation(); // 阻止事件冒泡，避免触发打开文件
                if (confirm(`确定要删除文件 ${fileInfo.id} 吗？`)) {
                    try {
                        const deleteResponse = await fetch(`/files/${fileInfo.id}`, {
                            method: 'DELETE'
                        });
                        
                        if (deleteResponse.ok) {
                            alert('文件删除成功！');
                            loadFileList(); // 重新加载文件列表
                        } else {
                            const errorText = await deleteResponse.text();
                            alert('删除失败: ' + errorText);
                        }
                    } catch (error) {
                        console.error('Error deleting file:', error);
                        alert('删除过程中发生错误。');
                    }
                }
            });
            
            fileItem.appendChild(thumbnail);
            fileItem.appendChild(link);
            fileItem.appendChild(deleteBtn);
            fileList.appendChild(fileItem);
        });
    } catch (error) {
        console.error('Error loading file list:', error);
        fileList.innerHTML = '<p>加载文件列表失败。</p>';
    }
}

async function handleFileUpload() {
    const file = fileInput.files[0];
    if (!file || file.type !== 'application/pdf') {
        alert('请选择一个 PDF 文件。');
        return;
    }

    const formData = new FormData();
    formData.append('pdf', file);

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            alert('文件上传成功！');
            fileInput.value = ''; // 清空文件输入框
            loadFileList(); // 重新加载文件列表
        } else {
            const errorText = await response.text();
            alert('上传失败: ' + errorText);
        }
    } catch (error) {
        console.error('Error uploading file:', error);
        alert('上传过程中发生错误。');
    }
}

// --- PDF 阅读器逻辑 ---

async function loadPdf(filename) {
    if (currentPdfDoc) {
        currentPdfDoc.destroy();
    }
    
    // 使用文件名加载 PDF，但使用 ID 进行备注数据关联
    const fileId = filename.replace('.pdf', '');
    currentPdfFilename = filename;
    currentPageNumber = 1;
    scale = 1.0;
    isDualPageMode = false;
    isRecordMode = true; // 默认设置为录音模式
    modeToggle.checked = true; // 更新滑块状态
    updateModeButton(); // 更新模式按钮状态
    
    try {
        const pdfData = await fetch(`/uploads/${filename}`).then(res => res.arrayBuffer());
        currentPdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;
        numPages = currentPdfDoc.numPages;
        
        // 更新总页数显示
        document.getElementById('total-pages').textContent = numPages;
        
        await loadNotesData(fileId + '.json'); // 使用 ID 加载备注数据
        renderPage(currentPageNumber);
    } catch (error) {
        console.error('Error loading PDF:', error);
        alert('加载 PDF 文件时出错。');
    }
}

async function loadNotesData(dataFilename) {
    try {
        const response = await fetch(`/data/${dataFilename}`);
        notesData = await response.json();
        updateNotesList(); // 更新备注列表
    } catch (error) {
        console.error('Error loading notes data:', error);
        notesData = [];
        updateNotesList();
    }
}

async function saveNotesData() {
    if (!currentPdfFilename) return;
    
    // 使用 ID 保存备注数据
    const fileId = currentPdfFilename.replace('.pdf', '');
    const dataFilename = fileId + '.json';
    
    try {
        const response = await fetch(`/data/${dataFilename}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(notesData)
        });
        
        if (!response.ok) {
            throw new Error('Failed to save notes');
        }
    } catch (error) {
        console.error('Error saving notes data:', error);
        // 这里可以添加用户提示
    }
}

function renderPage(pageNumber) {
    if (!currentPdfDoc || isRendering) return;
    
    isRendering = true;
    const canvas = pdfCanvas;
    const ctx = canvas.getContext('2d');
    
    // 更新页码显示
    if (isDualPageMode && pageNumber < numPages) {
        document.getElementById('current-page').textContent = `${pageNumber}-${pageNumber + 1}`;
    } else {
        document.getElementById('current-page').textContent = pageNumber;
    }
    document.getElementById('total-pages').textContent = numPages;
    
    // 清除画布和旧的备注标记
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    clearNoteMarkers();
    
    // 移除可能存在的第二个画布
    const secondCanvas = document.getElementById('pdf-canvas-second');
    if (secondCanvas) {
        secondCanvas.remove();
    }

    // 检查页码有效性
    if (pageNumber < 1 || pageNumber > numPages) {
        isRendering = false;
        return;
    }

    // 单页模式
    if (!isDualPageMode) {
        currentPdfDoc.getPage(pageNumber).then(page => {
            const viewport = page.getViewport({ scale: scale });
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            const renderContext = {
                canvasContext: ctx,
                viewport: viewport
            };
            
            return page.render(renderContext).promise.then(() => {
                isRendering = false;
                // 渲染完成后，添加备注标记
                renderNoteMarkers();
            });
        }).catch(error => {
            console.error('Error rendering page:', error);
            isRendering = false;
        });
    } 
    // 双页模式
    else {
        // 创建第二个画布用于显示第二页
        const secondCanvas = document.createElement('canvas');
        secondCanvas.id = 'pdf-canvas-second';
        pdfContainer.appendChild(secondCanvas);
        const secondCtx = secondCanvas.getContext('2d');
        
        // 渲染第一页
        const renderFirstPage = currentPdfDoc.getPage(pageNumber).then(page => {
            const viewport = page.getViewport({ scale: scale });
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            const renderContext = {
                canvasContext: ctx,
                viewport: viewport
            };
            
            return page.render(renderContext).promise;
        });
        
        // 渲染第二页（如果存在）
        let renderSecondPage = Promise.resolve();
        if (pageNumber + 1 <= numPages) {
            renderSecondPage = currentPdfDoc.getPage(pageNumber + 1).then(page => {
                const viewport = page.getViewport({ scale: scale });
                secondCanvas.height = viewport.height;
                secondCanvas.width = viewport.width;

                const renderContext = {
                    canvasContext: secondCtx,
                    viewport: viewport
                };
                
                return page.render(renderContext).promise;
            });
        } else {
            // 如果没有第二页，隐藏第二个画布
            secondCanvas.style.display = 'none';
        }
        
        // 等待两个页面都渲染完成
        Promise.all([renderFirstPage, renderSecondPage]).then(() => {
            isRendering = false;
            // 渲染完成后，添加备注标记
            renderNoteMarkers();
        }).catch(error => {
            console.error('Error rendering pages:', error);
            isRendering = false;
        });
    }
}

function changePage(delta) {
    let newPageNumber;
    
    if (isDualPageMode) {
        if (delta > 0) {
            // 下一页 - 跳两页
            newPageNumber = Math.min(currentPageNumber + 2, numPages);
        } else {
            // 上一页 - 跳两页
            newPageNumber = Math.max(currentPageNumber - 2, 1);
        }
    } else {
        // 单页模式 - 跳一页
        newPageNumber = currentPageNumber + delta;
        newPageNumber = Math.max(1, Math.min(newPageNumber, numPages));
    }
    
    if (newPageNumber !== currentPageNumber) {
        currentPageNumber = newPageNumber;
        renderPage(currentPageNumber);
    }
}

function zoomPdf(factor) {
    scale *= factor;
    renderPage(currentPageNumber);
}

function fitPdfToWidth() {
    // 简化实现，实际需要计算容器宽度
    const containerWidth = pdfContainer.clientWidth - 40; // 减去一些边距
    if (currentPdfDoc) {
        currentPdfDoc.getPage(currentPageNumber).then(page => {
            const viewport = page.getViewport({ scale: 1.0 });
            scale = containerWidth / viewport.width;
            renderPage(currentPageNumber);
        });
    }
}

function fitPdfToHeight() {
    // 简化实现，实际需要计算容器高度
    const containerHeight = pdfContainer.clientHeight - 40; // 减去一些边距
    if (currentPdfDoc) {
        currentPdfDoc.getPage(currentPageNumber).then(page => {
            const viewport = page.getViewport({ scale: 1.0 });
            scale = containerHeight / viewport.height;
            renderPage(currentPageNumber);
        });
    }
}

function toggleViewMode() {
    isDualPageMode = !isDualPageMode;
    toggleViewModeBtn.textContent = isDualPageMode ? '单页模式' : '双页模式';
    
    // 添加双页模式的CSS类
    if (isDualPageMode) {
        pdfContainer.classList.add('dual-page');
    } else {
        pdfContainer.classList.remove('dual-page');
    }
    
    renderPage(currentPageNumber);
}

function toggleMode() {
    isRecordMode = modeToggle.checked;
    updateModeButton();
}

function updateModeButton() {
    // 滑块状态已经通过 checked 属性反映，无需额外样式处理
    if (isRecordMode) {
        console.log("进入录音模式");
    } else {
        console.log("退出录音模式");
    }
}

// 设置默认模式为录音模式
function setDefaultMode() {
    isRecordMode = true;
    modeToggle.checked = true;
    updateModeButton();
}

// --- 备注逻辑 ---

function clearNoteMarkers() {
    // 清除所有现有的备注标记
    const markers = pdfContainer.querySelectorAll('.note-marker');
    markers.forEach(marker => marker.remove());
}

function renderNoteMarkers() {
    // 清除所有现有的备注标记
    const markers = pdfContainer.querySelectorAll('.note-marker');
    markers.forEach(marker => marker.remove());

    // 策划选出当前页面的备注（在双页模式下包括两个页面）
    let currentPageNotes;
    if (isDualPageMode && currentPageNumber < numPages) {
        currentPageNotes = notesData.filter(note => 
            note.page === currentPageNumber || note.page === currentPageNumber + 1
        );
    } else {
        currentPageNotes = notesData.filter(note => note.page === currentPageNumber);
    }
    
    currentPageNotes.forEach(note => {
        const marker = document.createElement('div');
        marker.className = `note-marker ${note.type}`;
        marker.dataset.id = note.id;
        
        // 根据类型设置颜色或图标
        if (note.type === 'text') {
            marker.style.backgroundColor = note.color;
        }
        // 录音标记的样式已在CSS中定义
        
        let x, y;
        
        // 在双页模式下，需要根据备注属于哪一页来计算位置
        if (isDualPageMode && currentPageNumber < numPages) {
            // 获取两个画布元素
            const firstCanvas = pdfCanvas;
            const secondCanvas = document.getElementById('pdf-canvas-second');
            
            if (note.page === currentPageNumber) {
                // 备注在第一页
                const canvasRect = firstCanvas.getBoundingClientRect();
                const containerRect = pdfContainer.getBoundingClientRect();
                
                // 使用第一页画布的尺寸计算位置
                x = note.relativeX * canvasRect.width + canvasRect.left - containerRect.left + pdfContainer.scrollLeft;
                y = note.relativeY * canvasRect.height + canvasRect.top - containerRect.top + pdfContainer.scrollTop;
            } else if (note.page === currentPageNumber + 1 && secondCanvas) {
                // 备注在第二页
                const canvasRect = secondCanvas.getBoundingClientRect();
                const containerRect = pdfContainer.getBoundingClientRect();
                
                // 使用第二页画布的尺寸计算位置
                x = note.relativeX * canvasRect.width + canvasRect.left - containerRect.left + pdfContainer.scrollLeft;
                y = note.relativeY * canvasRect.height + canvasRect.top - containerRect.top + pdfContainer.scrollTop;
            }
        } else {
            // 单页模式或只有一页的情况
            const canvasRect = pdfCanvas.getBoundingClientRect();
            const containerRect = pdfContainer.getBoundingClientRect();
            
            // 使用画布的尺寸计算位置
            x = note.relativeX * canvasRect.width + canvasRect.left - containerRect.left + pdfContainer.scrollLeft;
            y = note.relativeY * canvasRect.height + canvasRect.top - containerRect.top + pdfContainer.scrollTop;
        }
        
        marker.style.left = `${x}px`;
        marker.style.top = `${y}px`;
        
        // 添加点击事件
        marker.addEventListener('click', (e) => {
            e.stopPropagation();
            if (note.type === 'text') {
                showNotePopup(note, marker);
            } else if (note.type === 'audio') {
                playRecord(note, marker);
            }
        });
        
        pdfContainer.appendChild(marker);
    });
    
    updateNotesList(); // 更新左侧备注列表
}

function updateNotesList() {
    notesList.innerHTML = '';
    // 筛选出当前页面的备注（在双页模式下包括两个页面）
    let currentPageNotes;
    if (isDualPageMode && currentPageNumber < numPages) {
        currentPageNotes = notesData.filter(note => 
            note.page === currentPageNumber || note.page === currentPageNumber + 1
        );
    } else {
        currentPageNotes = notesData.filter(note => note.page === currentPageNumber);
    }
    
    currentPageNotes.forEach(note => {
        const listItem = document.createElement('li');
        listItem.className = `note-item ${note.type}`;
        listItem.dataset.noteId = note.id; // 添加数据属性以便识别
        
        // 创建图标指示器
        const indicator = document.createElement('div');
        indicator.className = 'note-indicator';
        
        if (note.type === 'text') {
            indicator.style.backgroundColor = note.color;
        }
        // 录音备注的图标已在CSS中定义
        
        const text = document.createElement('span');
        text.className = 'note-text';
        
        // 添加页面信息
        const pageInfo = document.createElement('span');
        pageInfo.className = 'page-info';
        pageInfo.textContent = ` (第${note.page}页)`;
        pageInfo.style.fontSize = '12px';
        pageInfo.style.color = '#666';
        pageInfo.style.marginLeft = '5px';
        
        if (note.type === 'text') {
            text.textContent = `${note.wordCount || 0} 字`;
        } else if (note.type === 'audio') {
            text.textContent = `${note.duration ? note.duration.toFixed(2) : 0} 秒`;
        }
        
        // 创建更多按钮
        const moreButton = document.createElement('button');
        moreButton.className = 'more-button';
        moreButton.innerHTML = '&#8942;'; // 三个垂直点
        moreButton.title = '更多选项';
        
        // 创建抽屉菜单
        const drawerMenu = document.createElement('div');
        drawerMenu.className = 'drawer-menu';
        
        const deleteItem = document.createElement('div');
        deleteItem.className = 'menu-item delete';
        deleteItem.textContent = '删除';
        deleteItem.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteNote(note.id);
            drawerMenu.classList.remove('show');
        });
        
        drawerMenu.appendChild(deleteItem);
        
        // 点击更多按钮显示/隐藏抽屉菜单
        moreButton.addEventListener('click', (e) => {
            e.stopPropagation();
            // 隐藏其他所有抽屉菜单
            document.querySelectorAll('.drawer-menu').forEach(menu => {
                if (menu !== drawerMenu) {
                    menu.classList.remove('show');
                }
            });
            
            // 切换当前抽屉菜单
            drawerMenu.classList.toggle('show');
        });
        
        listItem.appendChild(indicator);
        listItem.appendChild(text);
        listItem.appendChild(pageInfo);
        listItem.appendChild(moreButton);
        listItem.appendChild(drawerMenu);
        
        // 添加点击事件，定位到备注
        listItem.addEventListener('click', (e) => {
            // 如果点击的是更多按钮或抽屉菜单，不执行定位操作
            if (e.target === moreButton || drawerMenu.contains(e.target)) {
                return;
            }
            
            // TODO: 实现定位到备注标记的逻辑
            // 例如，高亮标记或滚动到标记位置
            const marker = pdfContainer.querySelector(`.note-marker[data-id="${note.id}"]`);
            if (marker) {
                marker.scrollIntoView({ behavior: 'smooth', block: 'center' });
                marker.style.transform = 'translate(-50%, -50%) scale(1.5)'; // 放大效果
                setTimeout(() => {
                     marker.style.transform = 'translate(-50%, -50%)'; // 恢复
                }, 500);
                
                // 如果是文字备注，弹出悬浮框
                if (note.type === 'text') {
                    showNotePopup(note, marker);
                } else if (note.type === 'audio') {
                    playRecord(note, marker);
                }
            }
        });
        
        notesList.appendChild(listItem);
    });
    
    // 点击页面其他地方隐藏所有抽屉菜单
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.more-button') && !e.target.closest('.drawer-menu')) {
            document.querySelectorAll('.drawer-menu').forEach(menu => {
                menu.classList.remove('show');
            });
        }
    });
}

// --- 悬浮备注框逻辑 ---

function showNotePopup(note, markerElement) {
    // 防止重复打开
    if (document.querySelector(`.note-popup[data-note-id="${note.id}"]`)) {
        return;
    }

    const popup = document.getElementById('note-popup-template').cloneNode(true);
    popup.id = ''; // 移除模板的ID
    popup.style.display = 'block';
    popup.dataset.noteId = note.id;
    
    const textarea = popup.querySelector('.note-content');
    textarea.value = note.content || '';
    
    // 设置背景色和边框色与标记一致
    if (note.type === 'text') {
        popup.style.backgroundColor = '#E0F010'; // 统一背景色
        popup.style.borderColor = note.color; // 边框色与标记一致
    }
    
    // 设置初始位置在标记附近
    const markerRect = markerElement.getBoundingClientRect();
    const containerRect = pdfContainer.getBoundingClientRect();
    let left = markerRect.left - containerRect.left + markerRect.width;
    let top = markerRect.top - containerRect.top;
    
    // 简单的边界检查
    if (left + 250 > pdfContainer.clientWidth) {
        left = pdfContainer.clientWidth - 250;
    }
    if (top + 150 > pdfContainer.clientHeight) {
        top = pdfContainer.clientHeight - 150;
    }
    if (left < 0) left = 0;
    if (top < 0) top = 0;
    
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
    
    // 使悬浮框可拖动
    makePopupDraggable(popup);
    
    // 绑定按钮事件
    popup.querySelector('.edit-btn').addEventListener('click', () => {
        textarea.readOnly = false;
        textarea.focus();
    });
    
    popup.querySelector('.delete-btn').addEventListener('click', () => {
        deleteNote(note.id);
        popup.remove();
    });
    
    popup.querySelector('.pin-btn').addEventListener('click', function() {
        const isPinned = this.textContent === '📍';
        this.textContent = isPinned ? '📌' : '📍';
        // 这里可以添加钉住/取消钉住的逻辑，例如添加一个类
        if (isPinned) {
            popup.classList.remove('pinned');
        } else {
            popup.classList.add('pinned');
        }
    });
    
    popup.querySelector('.close-btn').addEventListener('click', () => {
        popup.remove();
    });
    
    // 文本域内容变化时更新数据并调整高度
    textarea.addEventListener('input', () => {
        const updatedNote = notesData.find(n => n.id === note.id);
        if (updatedNote) {
            updatedNote.content = textarea.value;
            updatedNote.wordCount = textarea.value.length; // 简化计算
            saveNotesData(); // 保存到服务器
            updateNotesList(); // 更新列表
        }
        
        // 自动调整文本域高度
        adjustTextareaHeight(textarea);
    });
    
    // 初始化文本域高度
    // 使用setTimeout确保DOM已完全渲染后再调整高度
    setTimeout(() => {
        adjustTextareaHeight(textarea);
    }, 0);
    
    // 对于新创建的备注（没有内容的备注），默认钉住并设置为可编辑状态
    if (!note.content) {
        // 默认钉住新备注框
        popup.classList.add('pinned');
        popup.querySelector('.pin-btn').textContent = '📍';
        
        // 新备注默认可编辑
        textarea.readOnly = false;
        textarea.focus();
    } else {
        // 点击外部关闭（非钉住状态）
        pdfContainer.addEventListener('click', function closeListener(e) {
            if (!popup.contains(e.target) && !popup.classList.contains('pinned')) {
                popup.remove();
                pdfContainer.removeEventListener('click', closeListener);
            }
        });
    }
    
    pdfContainer.appendChild(popup);
}

function makePopupDraggable(popupElement) {
    const header = popupElement.querySelector('.popup-header');
    let isDragging = false;
    let offsetX, offsetY;

    header.addEventListener('mousedown', (e) => {
        e.stopPropagation(); // 阻止事件冒泡到容器的 mousedown 处理器
        isDragging = true;
        isDraggingPopup = true; // 设置拖动标志
        offsetX = e.clientX - popupElement.getBoundingClientRect().left;
        offsetY = e.clientY - popupElement.getBoundingClientRect().top;
        // 将拖动的元素置于顶层
        popupElement.style.zIndex = 1000;
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const containerRect = pdfContainer.getBoundingClientRect();
        let x = e.clientX - containerRect.left - offsetX;
        let y = e.clientY - containerRect.top - offsetY;
        
        // 边界限制
        x = Math.max(0, Math.min(x, pdfContainer.clientWidth - popupElement.offsetWidth));
        y = Math.max(0, Math.min(y, pdfContainer.clientHeight - popupElement.offsetHeight));
        
        popupElement.style.left = `${x}px`;
        popupElement.style.top = `${y}px`;
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            isDraggingPopup = false; // 清除拖动标志
            // 恢复原来的 z-index
            popupElement.style.zIndex = 100;
        }
    });
}

function deleteNote(noteId) {
    notesData = notesData.filter(note => note.id !== noteId);
    saveNotesData();
    renderNoteMarkers(); // 重新渲染标记
    updateNotesList();   // 更新列表
}

// --- 画布交互 (添加备注/录音) ---

function handleCanvasMouseDown(e) {
    if (e.button !== 0) return; // 只处理左键
    
    // 如果正在拖动悬浮框，则不处理
    if (isDraggingPopup) {
        return;
    }
    
    // 计算相对于PDF容器的坐标
    const containerRect = pdfContainer.getBoundingClientRect();
    const x = e.clientX - containerRect.left + pdfContainer.scrollLeft;
    const y = e.clientY - containerRect.top + pdfContainer.scrollTop;
    
    let isInCanvas = false;
    
    if (isDualPageMode && currentPageNumber < numPages) {
        // 双页模式下，检查是否在任一canvas范围内
        const firstCanvas = pdfCanvas;
        const secondCanvas = document.getElementById('pdf-canvas-second');
        
        // 检查第一个canvas
        const firstCanvasRect = firstCanvas.getBoundingClientRect();
        const firstCanvasLeft = firstCanvasRect.left - containerRect.left + pdfContainer.scrollLeft;
        const firstCanvasTop = firstCanvasRect.top - containerRect.top + pdfContainer.scrollTop;
        const firstCanvasRight = firstCanvasLeft + firstCanvas.offsetWidth;
        const firstCanvasBottom = firstCanvasTop + firstCanvas.offsetHeight;
        
        if (x >= firstCanvasLeft && x <= firstCanvasRight && y >= firstCanvasTop && y <= firstCanvasBottom) {
            isInCanvas = true;
        }
        
        // 如果第二页存在，检查第二个canvas
        if (secondCanvas) {
            const secondCanvasRect = secondCanvas.getBoundingClientRect();
            const secondCanvasLeft = secondCanvasRect.left - containerRect.left + pdfContainer.scrollLeft;
            const secondCanvasTop = secondCanvasRect.top - containerRect.top + pdfContainer.scrollTop;
            const secondCanvasRight = secondCanvasLeft + secondCanvas.offsetWidth;
            const secondCanvasBottom = secondCanvasTop + secondCanvas.offsetHeight;
            
            if (x >= secondCanvasLeft && x <= secondCanvasRight && y >= secondCanvasTop && y <= secondCanvasBottom) {
                isInCanvas = true;
            }
        }
    } else {
        // 单页模式下，检查是否在canvas范围内
        const canvasRect = pdfCanvas.getBoundingClientRect();
        const canvasLeft = canvasRect.left - containerRect.left + pdfContainer.scrollLeft;
        const canvasTop = canvasRect.top - containerRect.top + pdfContainer.scrollTop;
        const canvasRight = canvasLeft + pdfCanvas.offsetWidth;
        const canvasBottom = canvasTop + pdfCanvas.offsetHeight;
        
        if (x >= canvasLeft && x <= canvasRight && y >= canvasTop && y <= canvasBottom) {
            isInCanvas = true;
        }
    }
    
    // 如果点击位置不在任一canvas范围内，则不处理
    if (!isInCanvas) {
        return;
    }
    
    // 检查是否点击在已有备注标记上
    const clickedElement = e.target;
    if (clickedElement.classList.contains('note-marker')) {
        // 点击标记已在标记的点击事件中处理
        return;
    }
    
    // 检查是否点击在已存在的悬浮框上
    const popups = document.querySelectorAll('.note-popup');
    for (let i = 0; i < popups.length; i++) {
        const popup = popups[i];
        const popupRect = popup.getBoundingClientRect();
        const popupLeft = popupRect.left - containerRect.left + pdfContainer.scrollLeft;
        const popupTop = popupRect.top - containerRect.top + pdfContainer.scrollTop;
        const popupRight = popupLeft + popupRect.width;
        const popupBottom = popupTop + popupRect.height;
        
        // 如果点击位置在悬浮框内，则不处理
        if (x >= popupLeft && x <= popupRight && y >= popupTop && y <= popupBottom) {
            return;
        }
    }
    
    // 开始长按定时器
    isLongPressTriggered = false;
    longPressTimer = setTimeout(() => {
        isLongPressTriggered = true;
        if (isRecordMode) {
            startRecording(x, y);
        } else {
            addTextNote(x, y);
        }
    }, isRecordMode ? 1000 : 500); // 录音模式1秒，文字备注0.5秒
}

function handleCanvasMouseUp(e) {
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
    
    // 如果正在录音，则停止录音
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        console.log('Stopping recording...');
        mediaRecorder.stop();
    }
    
    if (isLongPressTriggered) {
        // 长按已触发，不需要额外操作
        isLongPressTriggered = false;
        return;
    }
    
    // 短按，用于停止播放录音
    if (currentAudio) {
        stopPlayingRecord();
    }
}

function handleCanvasMouseLeave() {
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
    
    // 如果正在录音，则停止录音
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        console.log('Stopping recording due to mouse leave...');
        mediaRecorder.stop();
    }
    
    isLongPressTriggered = false;
}

function addTextNote(x, y) {
    // 检查坐标是否在canvas范围内
    const containerRect = pdfContainer.getBoundingClientRect();
    
    let targetPage = currentPageNumber;
    let relativeX, relativeY;
    
    if (isDualPageMode && currentPageNumber < numPages) {
        // 双页模式下，需要判断点击的是第一页还是第二页
        const firstCanvas = pdfCanvas;
        const secondCanvas = document.getElementById('pdf-canvas-second');
        
        const firstCanvasRect = firstCanvas.getBoundingClientRect();
        const firstCanvasLeft = firstCanvasRect.left - containerRect.left + pdfContainer.scrollLeft;
        const firstCanvasTop = firstCanvasRect.top - containerRect.top + pdfContainer.scrollTop;
        const firstCanvasRight = firstCanvasLeft + firstCanvas.offsetWidth;
        const firstCanvasBottom = firstCanvasTop + firstCanvas.offsetHeight;
        
        // 检查是否点击在第一页上
        if (x >= firstCanvasLeft && x <= firstCanvasRight && y >= firstCanvasTop && y <= firstCanvasBottom) {
            targetPage = currentPageNumber;
            // 计算相对于第一页canvas的相对坐标
            relativeX = (x - firstCanvasLeft) / firstCanvas.offsetWidth;
            relativeY = (y - firstCanvasTop) / firstCanvas.offsetHeight;
        } 
        // 如果第二页存在，检查是否点击在第二页上
        else if (secondCanvas) {
            const secondCanvasRect = secondCanvas.getBoundingClientRect();
            const secondCanvasLeft = secondCanvasRect.left - containerRect.left + pdfContainer.scrollLeft;
            const secondCanvasTop = secondCanvasRect.top - containerRect.top + pdfContainer.scrollTop;
            const secondCanvasRight = secondCanvasLeft + secondCanvas.offsetWidth;
            const secondCanvasBottom = secondCanvasTop + secondCanvas.offsetHeight;
            
            // 检查点击位置是否在第二页canvas范围内
            if (x >= secondCanvasLeft && x <= secondCanvasRight && y >= secondCanvasTop && y <= secondCanvasBottom) {
                targetPage = currentPageNumber + 1;
                // 计算相对于第二页canvas的相对坐标
                relativeX = (x - secondCanvasLeft) / secondCanvas.offsetWidth;
                relativeY = (y - secondCanvasTop) / secondCanvas.offsetHeight;
            } 
            // 如果都不在范围内，则不添加备注
            else {
                return;
            }
        } 
        // 如果第二页不存在且点击位置不在第一页范围内，则不添加备注
        else {
            return;
        }
    } 
    // 单页模式
    else {
        const canvasRect = pdfCanvas.getBoundingClientRect();
        const canvasLeft = canvasRect.left - containerRect.left + pdfContainer.scrollLeft;
        const canvasTop = canvasRect.top - containerRect.top + pdfContainer.scrollTop;
        const canvasRight = canvasLeft + pdfCanvas.offsetWidth;
        const canvasBottom = canvasTop + pdfCanvas.offsetHeight;
        
        // 如果坐标不在canvas范围内，则不添加备注
        if (x < canvasLeft || x > canvasRight || y < canvasTop || y > canvasBottom) {
            return;
        }
        
        targetPage = currentPageNumber;
        // 计算相对于canvas的相对坐标
        relativeX = (x - canvasLeft) / pdfCanvas.offsetWidth;
        relativeY = (y - canvasTop) / pdfCanvas.offsetHeight;
    }
    
    const id = `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const color = getRandomNoteColor();
    
    const newNote = {
        id: id,
        page: targetPage, // 使用计算出的目标页面
        relativeX: relativeX,
        relativeY: relativeY,
        color: color,
        content: '',
        type: 'text',
        wordCount: 0
    };
    
    notesData.push(newNote);
    saveNotesData();
    renderNoteMarkers();
    
    // 找到新创建的标记元素并弹出编辑框
    setTimeout(() => {
        const markerElement = pdfContainer.querySelector(`.note-marker[data-id="${id}"]`);
        if (markerElement) {
            showNotePopup(newNote, markerElement);
            // 新备注的文本域应默认可编辑
            const popup = document.querySelector(`.note-popup[data-note-id="${id}"]`);
            if (popup) {
                const textarea = popup.querySelector('.note-content');
                textarea.readOnly = false;
                textarea.focus();
            }
        }
    }, 10);
}

function getRandomNoteColor() {
    const colors = ['#1ABC9C','#2ECC71','#3498DB','#9B59B6','#34495E','#F1C40F',
    '#E67E22','#E74C3C','#95A5A6','#16A085','#27AE60','#2980B9','#8E44AD','#2C3E50',
    '#F39C12','#D35400','#C0392B','#7F8C8D'];
    return colors[Math.floor(Math.random() * colors.length)];
}

// --- 录音逻辑 ---

async function startRecording(x, y) {
    console.log('Starting recording at coordinates:', x, y);
    
    // 检查坐标是否在canvas范围内并确定目标页面
    const containerRect = pdfContainer.getBoundingClientRect();
    
    let targetPage = currentPageNumber;
    let relativeX, relativeY;
    
    if (isDualPageMode && currentPageNumber < numPages) {
        // 双页模式下，需要判断点击的是第一页还是第二页
        const firstCanvas = pdfCanvas;
        const secondCanvas = document.getElementById('pdf-canvas-second');
        
        const firstCanvasRect = firstCanvas.getBoundingClientRect();
        const firstCanvasLeft = firstCanvasRect.left - containerRect.left + pdfContainer.scrollLeft;
        const firstCanvasTop = firstCanvasRect.top - containerRect.top + pdfContainer.scrollTop;
        const firstCanvasRight = firstCanvasLeft + firstCanvas.offsetWidth;
        const firstCanvasBottom = firstCanvasTop + firstCanvas.offsetHeight;
        
        // 检查是否点击在第一页上
        if (x >= firstCanvasLeft && x <= firstCanvasRight && y >= firstCanvasTop && y <= firstCanvasBottom) {
            targetPage = currentPageNumber;
            // 计算相对于第一页canvas的相对坐标
            relativeX = (x - firstCanvasLeft) / firstCanvas.offsetWidth;
            relativeY = (y - firstCanvasTop) / firstCanvas.offsetHeight;
        } 
        // 如果第二页存在，检查是否点击在第二页上
        else if (secondCanvas) {
            const secondCanvasRect = secondCanvas.getBoundingClientRect();
            const secondCanvasLeft = secondCanvasRect.left - containerRect.left + pdfContainer.scrollLeft;
            const secondCanvasTop = secondCanvasRect.top - containerRect.top + pdfContainer.scrollTop;
            const secondCanvasRight = secondCanvasLeft + secondCanvas.offsetWidth;
            const secondCanvasBottom = secondCanvasTop + secondCanvas.offsetHeight;
            
            // 检查点击位置是否在第二页canvas范围内
            if (x >= secondCanvasLeft && x <= secondCanvasRight && y >= secondCanvasTop && y <= secondCanvasBottom) {
                targetPage = currentPageNumber + 1;
                // 计算相对于第二页canvas的相对坐标
                relativeX = (x - secondCanvasLeft) / secondCanvas.offsetWidth;
                relativeY = (y - secondCanvasTop) / secondCanvas.offsetHeight;
            } 
            // 如果都不在范围内，则不添加录音备注
            else {
                console.log('Recording position is outside canvas boundaries, ignoring.');
                return;
            }
        } 
        // 如果第二页不存在且点击位置不在第一页范围内，则不添加录音备注
        else {
            console.log('Recording position is outside canvas boundaries, ignoring.');
            return;
        }
    } 
    // 单页模式
    else {
        const canvasRect = pdfCanvas.getBoundingClientRect();
        const canvasLeft = canvasRect.left - containerRect.left + pdfContainer.scrollLeft;
        const canvasTop = canvasRect.top - containerRect.top + pdfContainer.scrollTop;
        const canvasRight = canvasLeft + pdfCanvas.offsetWidth;
        const canvasBottom = canvasTop + pdfCanvas.offsetHeight;
        
        console.log('Canvas boundaries:', canvasLeft, canvasTop, canvasRight, canvasBottom);
        
        // 如果坐标不在canvas范围内，则不添加录音备注
        if (x < canvasLeft || x > canvasRight || y < canvasTop || y > canvasBottom) {
            console.log('Recording position is outside canvas boundaries, ignoring.');
            return;
        }
        
        targetPage = currentPageNumber;
        // 计算相对于canvas的相对坐标
        relativeX = (x - canvasLeft) / pdfCanvas.offsetWidth;
        relativeY = (y - canvasTop) / pdfCanvas.offsetHeight;
    }
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        recordedChunks = [];
        
        mediaRecorder.ondataavailable = event => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = async () => {
            console.log('MediaRecorder stopped, processing recording...');
            const blob = new Blob(recordedChunks, { type: 'audio/webm' });
            const filename = `record-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.webm`;
            
            const formData = new FormData();
            formData.append('record', blob, filename);
            
            try {
                const response = await fetch('/upload-record', {
                    method: 'POST',
                    body: formData
                });
                
                if (response.ok) {
                    const data = await response.json();
                    console.log('Record uploaded successfully:', data);
                    
                    // 创建录音备注数据
                    const id = `record-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    
                    console.log('Creating record note with relative coordinates:', relativeX, relativeY);
                    
                    // 简化处理，实际应用中应获取准确时长
                    const duration = recordedChunks.reduce((acc, chunk) => acc + chunk.size, 0) / 10000; 
                    
                    const newRecordNote = {
                        id: id,
                        page: targetPage, // 使用计算出的目标页面
                        relativeX: relativeX,
                        relativeY: relativeY,
                        type: 'audio',
                        audioFilename: data.filename,
                        duration: duration
                    };
                    
                    notesData.push(newRecordNote);
                    saveNotesData();
                    renderNoteMarkers();
                } else {
                    console.error('Failed to upload record');
                }
            } catch (error) {
                console.error('Error uploading record:', error);
            }
            
            // 停止所有轨道
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        console.log('Recording started...');
        // 这里可以添加录音中的UI反馈
        
    } catch (error) {
        console.error('Error accessing microphone:', error);
        alert('无法访问麦克风，请检查权限设置。');
    }
}

function playRecord(note, markerElement) {
    // 停止当前播放
    if (currentAudio) {
        stopPlayingRecord();
    }
    
    const audio = new Audio(`/records/${note.audioFilename}`);
    audio.play().then(() => {
        currentAudio = audio;
        currentPlayingMarker = markerElement;
        markerElement.classList.add('playing');
        
        audio.addEventListener('ended', () => {
            stopPlayingRecord();
        });
    }).catch(error => {
        console.error('Error playing audio:', error);
    });
}

function stopPlayingRecord() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    if (currentPlayingMarker) {
        currentPlayingMarker.classList.remove('playing');
        currentPlayingMarker = null;
    }
}

// 调整文本域高度的函数
function adjustTextareaHeight(textarea) {
    // 重置高度以重新计算 scrollHeight
    textarea.style.height = 'auto';
    
    // 设置新高度为实际内容高度，但不超过最大高度
    const newHeight = Math.min(textarea.scrollHeight, 500); // 限制最大高度为300px
    textarea.style.height = newHeight + 'px';
}