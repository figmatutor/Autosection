"use strict";
// AutoSection 플러그인 - 프레임을 자동으로 섹션으로 그룹화
// 비개발자를 위한 Figma 플러그인
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// 플러그인 UI 표시
figma.showUI(__html__, { width: 350, height: 600 });
// 기본 설정
const DEFAULT_SETTINGS = {
    direction: 'vertical',
    margins: {
        top: 40,
        bottom: 40,
        left: 40,
        right: 40
    },
    spacing: 48
};
// 자동 리사이징을 위한 변수들
let autoResizeEnabled = false;
let trackedSections = new Map(); // 섹션 ID -> 정보
let debounceTimer = null;
let monitoringInterval = null;
let currentSettings = Object.assign({}, DEFAULT_SETTINGS);
// 디바운스 함수 (성능 최적화)
function debounce(func, delay) {
    return (...args) => {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => func.apply(null, args), delay);
    };
}
function arrangeFrames(input, settings) {
    // 섹션인 경우 자식 프레임들을 가져와서 정렬하고 void 반환
    if (input instanceof Array === false) {
        const section = input;
        const frames = section.children.filter(child => child.type === 'FRAME');
        const result = arrangeFramesInternal(frames, settings);
        return; // void 반환
    }
    // 프레임 배열인 경우 정렬하고 크기 정보 반환
    const frames = input;
    return arrangeFramesInternal(frames, settings);
}
// SECTION 노드용 프레임 정렬 함수
function arrangeSectionFrames(section, settings) {
    const frames = section.children.filter(child => child.type === 'FRAME');
    if (frames.length === 0)
        return;
    if (settings.direction === 'vertical') {
        // 세로 정렬
        frames.sort((a, b) => a.y - b.y);
        let currentY = settings.margins.top;
        frames.forEach((frame, index) => {
            frame.x = settings.margins.left;
            frame.y = currentY;
            if (index < frames.length - 1) {
                currentY += frame.height + settings.spacing;
            }
        });
    }
    else {
        // 가로 정렬
        frames.sort((a, b) => a.x - b.x);
        let currentX = settings.margins.left;
        frames.forEach((frame, index) => {
            frame.x = currentX;
            frame.y = settings.margins.top;
            if (index < frames.length - 1) {
                currentX += frame.width + settings.spacing;
            }
        });
    }
}
// 실제 정렬 로직
function arrangeFramesInternal(frames, settings) {
    if (frames.length === 0)
        return { width: 0, height: 0 };
    let totalWidth = 0;
    let totalHeight = 0;
    let maxWidth = 0;
    let maxHeight = 0;
    if (settings.direction === 'vertical') {
        // 세로 정렬
        frames.sort((a, b) => a.y - b.y);
        let currentY = settings.margins.top;
        frames.forEach((frame, index) => {
            maxWidth = Math.max(maxWidth, frame.width);
            frame.x = settings.margins.left;
            frame.y = currentY;
            if (index < frames.length - 1) {
                currentY += frame.height + settings.spacing;
            }
            else {
                currentY += frame.height;
            }
        });
        totalWidth = maxWidth + settings.margins.left + settings.margins.right;
        totalHeight = currentY + settings.margins.bottom;
    }
    else {
        // 가로 정렬
        frames.sort((a, b) => a.x - b.x);
        let currentX = settings.margins.left;
        frames.forEach((frame, index) => {
            maxHeight = Math.max(maxHeight, frame.height);
            frame.x = currentX;
            frame.y = settings.margins.top;
            if (index < frames.length - 1) {
                currentX += frame.width + settings.spacing;
            }
            else {
                currentX += frame.width;
            }
        });
        totalWidth = currentX + settings.margins.right;
        totalHeight = maxHeight + settings.margins.top + settings.margins.bottom;
    }
    return { width: totalWidth, height: totalHeight };
}
// 프레임들의 경계 계산
function calculateBounds(frames) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    frames.forEach(frame => {
        minX = Math.min(minX, frame.x);
        minY = Math.min(minY, frame.y);
        maxX = Math.max(maxX, frame.x + frame.width);
        maxY = Math.max(maxY, frame.y + frame.height);
    });
    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
    };
}
// 섹션 내부 프레임들의 경계 계산 (여백 포함)
function calculateSectionBounds(section) {
    const frames = section.children.filter(child => child.type === 'FRAME');
    if (frames.length === 0)
        return { width: 100, height: 100 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    frames.forEach(frame => {
        minX = Math.min(minX, frame.x);
        minY = Math.min(minY, frame.y);
        maxX = Math.max(maxX, frame.x + frame.width);
        maxY = Math.max(maxY, frame.y + frame.height);
    });
    // 기본값을 넣어 안전하게 처리
    const defaultMargin = 40;
    return {
        width: Math.max(maxX + defaultMargin, 100),
        height: Math.max(maxY + defaultMargin, 100)
    };
}
// SECTION 노드용 크기 조정 함수
function resizeSectionToFitContent(section, settings) {
    const frames = section.children.filter(child => child.type === 'FRAME');
    if (frames.length === 0) {
        // 프레임이 없으면 최소 크기로 설정
        section.resizeWithoutConstraints(settings.margins.left + settings.margins.right, settings.margins.top + settings.margins.bottom);
        return;
    }
    let maxX = 0;
    let maxY = 0;
    frames.forEach(frame => {
        maxX = Math.max(maxX, frame.x + frame.width);
        maxY = Math.max(maxY, frame.y + frame.height);
    });
    // 여백을 포함한 최종 크기 계산
    const finalWidth = maxX + settings.margins.right;
    const finalHeight = maxY + settings.margins.bottom;
    section.resizeWithoutConstraints(finalWidth, finalHeight);
}
// 섹션 생성 함수 (안정성 강화)
function createSection(settings) {
    try {
        console.log(`[DEBUG] 섹션 생성 시작, 설정:`, settings);
        const selection = figma.currentPage.selection;
        const validFrames = selection.filter(node => node.type === 'FRAME' && !node.name.startsWith('AutoSection_'));
        if (validFrames.length < 2) {
            figma.ui.postMessage({
                type: 'error',
                message: '최소 2개 이상의 프레임을 선택해주세요.'
            });
            return;
        }
        // 자동 리사이징이 비활성화되어 있다면 활성화
        if (!autoResizeEnabled) {
            console.log(`[DEBUG] 자동 리사이징 시작`);
            startAutoResizeListener();
        }
        // 프레임들의 전체 영역 계산
        const bounds = calculateBounds(validFrames);
        // 섹션 이름 생성 (고유 ID 추가)
        const sectionName = `AutoSection_${Date.now()}`;
        console.log(`[DEBUG] 섹션 이름: ${sectionName}`);
        // SECTION 노드 생성
        const section = figma.createSection();
        section.name = sectionName;
        section.x = bounds.x;
        section.y = bounds.y;
        // 현재 페이지에 섹션 추가
        figma.currentPage.appendChild(section);
        console.log(`[DEBUG] 섹션 노드 생성 완료`);
        // 각 프레임을 섹션으로 이동
        validFrames.forEach(frame => {
            section.appendChild(frame);
        });
        console.log(`[DEBUG] ${validFrames.length}개 프레임을 섹션으로 이동 완료`);
        console.log(`[DEBUG] ---------- 섹션 초기 레이아웃 적용 ----------`);
        // 1단계: 설정 정보를 pluginData에 즉시 저장
        console.log(`[DEBUG] 1단계 - 설정 정보 저장:`, JSON.stringify(settings, null, 2));
        saveSectionSettings(section, settings);
        // 즉시 pluginData 저장 확인 (비동기 없이)
        console.log(`[DEBUG] 2단계 - pluginData 저장 즉시 확인`);
        const savedSettings = getSectionSettings(section);
        console.log(`[DEBUG] 저장된 설정 확인:`, JSON.stringify(savedSettings, null, 2));
        // pluginData 상태 확인
        const pluginDataCheck = section.getPluginData("autosection");
        console.log(`[DEBUG] pluginData 원본:`, pluginDataCheck);
        // 3단계: 저장된 설정으로 레이아웃 즉시 적용 (완전 동기화)
        console.log(`[CREATE] 3단계 - 저장된 설정으로 레이아웃 즉시 적용`);
        try {
            // 설정 재확인 (저장이 제대로 되었는지 검증)
            const verifySettings = getSectionSettings(section);
            console.log(`[CREATE] 저장 재확인된 설정:`, JSON.stringify(verifySettings, null, 2));
            // 설정 일치성 확인
            const settingsMatch = (verifySettings.direction === savedSettings.direction &&
                JSON.stringify(verifySettings.margins) === JSON.stringify(savedSettings.margins) &&
                verifySettings.spacing === savedSettings.spacing);
            if (!settingsMatch) {
                console.warn(`[CREATE] ⚠️ 설정 불일치 감지, 재저장 시도`);
                const retrySuccess = saveSectionSettings(section, savedSettings);
                if (!retrySuccess) {
                    console.error(`[CREATE] ❌ 재저장 실패`);
                }
            }
            // 최종 검증된 설정으로 적용
            const finalSettings = getSectionSettings(section);
            console.log(`[CREATE] 최종 적용할 설정:`, JSON.stringify(finalSettings, null, 2));
            // 직접 레이아웃 적용 (확실한 적용)
            console.log(`[CREATE] SECTION 노드 직접 레이아웃 적용 시작`);
            console.log(`[CREATE] 프레임 정렬 시작...`);
            arrangeSectionFrames(section, finalSettings);
            console.log(`[CREATE] 프레임 정렬 완료`);
            console.log(`[CREATE] 섹션 크기 조정 시작...`);
            resizeSectionToFitContent(section, finalSettings);
            console.log(`[CREATE] 섹션 크기 조정 완료`);
            // updateSectionLayout으로 최종 검증 및 일관성 보장
            console.log(`[CREATE] updateSectionLayout으로 최종 검증`);
            updateSectionLayout(section, finalSettings);
            console.log(`[CREATE] 레이아웃 완전 적용 완료`);
        }
        catch (layoutError) {
            console.error(`[CREATE] ❌ 레이아웃 적용 실패:`, layoutError);
            // Fallback: 기본 방식으로 적용
            console.log(`[CREATE] Fallback 레이아웃 적용 시도`);
            try {
                arrangeSectionFrames(section, settings);
                resizeSectionToFitContent(section, settings);
                console.log(`[CREATE] Fallback 레이아웃 적용 완료`);
            }
            catch (fallbackError) {
                console.error(`[CREATE] ❌ Fallback도 실패:`, fallbackError);
            }
        }
        // 4단계: 추적 정보에 즉시 추가
        trackedSections.set(section.id, {
            frameCount: validFrames.length,
            settings: Object.assign({}, savedSettings)
        });
        console.log(`[DEBUG] 4단계 - 추적 정보 추가 완료`);
        // 5단계: 생성된 섹션 선택 (즉시)
        figma.currentPage.selection = [section];
        console.log(`[DEBUG] 5단계 - 섹션 선택 완료`);
        // 6단계: UI에 선택 정보 전송 (설정 정보 동기화)
        checkSelectionInfo();
        console.log(`[DEBUG] 6단계 - UI 선택 정보 전송 완료`);
        // 7단계: 뷰포트에서 섹션이 보이도록 조정
        figma.viewport.scrollAndZoomIntoView([section]);
        console.log(`[DEBUG] 7단계 - 뷰포트 조정 완료`);
        // 8단계: 최종 상태 로그
        console.log(`[DEBUG] ========== 섹션 생성 즉시 완료 ==========`);
        console.log(`[DEBUG] 섹션 이름: ${sectionName}`);
        console.log(`[DEBUG] 프레임 수: ${validFrames.length}개`);
        console.log(`[DEBUG] 최종 섹션 크기: ${section.width} x ${section.height}`);
        console.log(`[DEBUG] 적용된 설정 - 방향: ${savedSettings.direction}, 여백: ${JSON.stringify(savedSettings.margins)}, 간격: ${savedSettings.spacing}`);
        figma.ui.postMessage({
            type: 'success',
            message: `${validFrames.length}개 프레임으로 섹션이 생성되었습니다!`
        });
    }
    catch (error) {
        console.error('섹션 생성 중 오류:', error);
        figma.ui.postMessage({
            type: 'error',
            message: '섹션 생성 중 오류가 발생했습니다.'
        });
    }
}
// 섹션 내 프레임이 변경되었을 때 자동 리사이징 (완전히 재작성하여 안정성 극대화)
function autoResizeSection(section, customSettings) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    try {
        console.log(`[DEBUG] ========== 자동 리사이징 시작: ${section.name} ==========`);
        const frames = section.children.filter(child => child.type === 'FRAME');
        console.log(`[DEBUG] 현재 프레임 수: ${frames.length}`);
        // 설정 완전 검증 및 보정
        let settings;
        if (customSettings) {
            console.log(`[DEBUG] 커스텀 설정 사용:`, JSON.stringify(customSettings, null, 2));
            settings = Object.assign({}, customSettings);
        }
        else {
            console.log(`[DEBUG] 저장된 설정에서 로드`);
            settings = getSectionSettings(section);
            console.log(`[DEBUG] 로드된 설정:`, JSON.stringify(settings, null, 2));
        }
        // 설정값 유효성 완전 검증 및 보정
        if (!settings || typeof settings !== 'object') {
            console.error(`[DEBUG] 잘못된 설정값, 기본값 사용`);
            settings = Object.assign({}, DEFAULT_SETTINGS);
        }
        // 모든 필드 강제 보정
        settings = {
            direction: (settings.direction === 'horizontal') ? 'horizontal' : 'vertical',
            margins: {
                top: Math.max(0, Math.min(200, (_b = (_a = settings.margins) === null || _a === void 0 ? void 0 : _a.top) !== null && _b !== void 0 ? _b : 40)),
                bottom: Math.max(0, Math.min(200, (_d = (_c = settings.margins) === null || _c === void 0 ? void 0 : _c.bottom) !== null && _d !== void 0 ? _d : 40)),
                left: Math.max(0, Math.min(200, (_f = (_e = settings.margins) === null || _e === void 0 ? void 0 : _e.left) !== null && _f !== void 0 ? _f : 40)),
                right: Math.max(0, Math.min(200, (_h = (_g = settings.margins) === null || _g === void 0 ? void 0 : _g.right) !== null && _h !== void 0 ? _h : 40))
            },
            spacing: Math.max(0, Math.min(200, (_j = settings.spacing) !== null && _j !== void 0 ? _j : 48))
        };
        console.log(`[DEBUG] 최종 사용할 설정:`, JSON.stringify(settings, null, 2));
        if (frames.length === 0) {
            // 프레임이 모두 제거된 경우
            console.log(`[DEBUG] 프레임이 없음 - 최소 크기로 조정`);
            const minWidth = settings.margins.left + settings.margins.right;
            const minHeight = settings.margins.top + settings.margins.bottom;
            console.log(`[DEBUG] 최소 크기: ${minWidth} x ${minHeight}`);
            try {
                section.resizeWithoutConstraints(Math.max(minWidth, 100), Math.max(minHeight, 100));
                console.log(`[DEBUG] 최소 크기 적용 완료`);
            }
            catch (resizeError) {
                console.error(`[DEBUG] 크기 조정 실패:`, resizeError);
            }
            // 추적에서 제거
            trackedSections.delete(section.id);
            console.log(`[DEBUG] 추적에서 제거됨`);
            return;
        }
        console.log(`[DEBUG] ---------- 레이아웃 적용 시작 ----------`);
        // 이전 크기 기록
        const beforeWidth = section.width;
        const beforeHeight = section.height;
        console.log(`[DEBUG] 이전 크기: ${beforeWidth} x ${beforeHeight}`);
        // SECTION과 FRAME에 따라 최적화 처리
        try {
            if (section.type === 'SECTION') {
                console.log(`[DEBUG] SECTION 노드 처리`);
                // 프레임들 정렬
                arrangeSectionFrames(section, settings);
                console.log(`[DEBUG] 프레임 정렬 완료`);
                // 섹션 크기 조정
                resizeSectionToFitContent(section, settings);
                console.log(`[DEBUG] 섹션 크기 조정 완료`);
            }
            else {
                console.log(`[DEBUG] FRAME 노드 처리`);
                // 프레임 정렬 및 크기 계산
                const { width, height } = arrangeFrames(frames, settings);
                console.log(`[DEBUG] 계산된 새 크기: ${width} x ${height}`);
                // 크기 변경이 필요한지 확인 (1px 이상 차이)
                const widthDiff = Math.abs(section.width - width);
                const heightDiff = Math.abs(section.height - height);
                console.log(`[DEBUG] 크기 차이: width ${widthDiff}px, height ${heightDiff}px`);
                if (widthDiff > 1 || heightDiff > 1) {
                    console.log(`[DEBUG] 크기 변경 필요 - 적용 중...`);
                    section.resizeWithoutConstraints(Math.max(width, 100), Math.max(height, 100));
                    console.log(`[DEBUG] 크기 변경 완료: ${width} x ${height}`);
                }
                else {
                    console.log(`[DEBUG] 크기 변경 불필요`);
                }
            }
        }
        catch (processingError) {
            console.error(`[DEBUG] 레이아웃 처리 중 오류:`, processingError);
            // 오류 격리 및 기본 처리
            try {
                console.log(`[DEBUG] 오류 복구 시도`);
                if (section.type === 'SECTION') {
                    resizeSectionToFitContent(section, DEFAULT_SETTINGS);
                }
                else {
                    const bounds = calculateSectionBounds(section);
                    section.resizeWithoutConstraints(Math.max(bounds.width, 100), Math.max(bounds.height, 100));
                }
                console.log(`[DEBUG] 오류 복구 성공`);
            }
            catch (recoveryError) {
                console.error(`[DEBUG] 오류 복구도 실패:`, recoveryError);
            }
        }
        // 이후 크기 확인
        const afterWidth = section.width;
        const afterHeight = section.height;
        console.log(`[DEBUG] 이후 크기: ${afterWidth} x ${afterHeight}`);
        // 추적 정보 강제 업데이트 (최신 설정으로)
        trackedSections.set(section.id, {
            frameCount: frames.length,
            settings: Object.assign({}, settings)
        });
        console.log(`[DEBUG] 추적 정보 업데이트 완료`);
        // 설정 정보 다시 저장 (일관성 유지)
        try {
            saveSectionSettings(section, settings);
            console.log(`[DEBUG] 설정 재저장 완료`);
        }
        catch (saveError) {
            console.error(`[DEBUG] 설정 저장 실패:`, saveError);
        }
        console.log(`[DEBUG] ========== 자동 리사이징 완료: ${section.name} ==========`);
    }
    catch (error) {
        console.error(`[DEBUG] 자동 리사이징 중 치명적 오류:`, error);
        console.error(`[DEBUG] 오류 섹션: ${section === null || section === void 0 ? void 0 : section.name}, 타입: ${section === null || section === void 0 ? void 0 : section.type}`);
        // 오류 발생 시 개별 섹션만 추적에서 제거
        if (section === null || section === void 0 ? void 0 : section.id) {
            trackedSections.delete(section.id);
            console.log(`[DEBUG] 오류로 인한 추적 제거: ${section.id}`);
        }
    }
}
// 모든 AutoSection 체크 (설정 변경 감지 강화)
function checkAllAutoSections() {
    if (!autoResizeEnabled)
        return;
    try {
        console.log(`[DEBUG] ========== 모든 AutoSection 체크 시작 ==========`);
        // 현재 페이지의 모든 노드를 순회하여 AutoSection 찾기
        function findAutoSections(node) {
            const sections = [];
            // SECTION 노드 또는 AutoSection_ 프레임 찾기
            if ((node.type === 'SECTION' && node.name.startsWith('AutoSection_')) ||
                (node.type === 'FRAME' && node.name.startsWith('AutoSection_'))) {
                sections.push(node);
            }
            if ('children' in node) {
                for (const child of node.children) {
                    sections.push(...findAutoSections(child));
                }
            }
            return sections;
        }
        const allAutoSections = findAutoSections(figma.currentPage);
        console.log(`[DEBUG] 찾은 AutoSection 수: ${allAutoSections.length}`);
        allAutoSections.forEach((section, index) => {
            try {
                console.log(`[DEBUG] ---------- 섹션 ${index + 1}/${allAutoSections.length}: ${section.name} ----------`);
                const currentFrameCount = section.children.filter(child => child.type === 'FRAME').length;
                const tracked = trackedSections.get(section.id);
                console.log(`[DEBUG] 현재 프레임 수: ${currentFrameCount}`);
                if (!tracked) {
                    console.log(`[DEBUG] 추적되지 않은 섹션 - 새로 추가`);
                    // 새로 발견된 섹션을 추적 목록에 추가
                    const settings = getSectionSettings(section);
                    trackedSections.set(section.id, {
                        frameCount: currentFrameCount,
                        settings: settings
                    });
                    console.log(`[DEBUG] 새 섹션 추적 시작: ${section.name}`);
                    return; // continue 대신 return 사용
                }
                const trackedFrameCount = tracked.frameCount;
                const trackedSettings = tracked.settings;
                console.log(`[DEBUG] 추적된 프레임 수: ${trackedFrameCount}`);
                console.log(`[DEBUG] 추적된 설정:`, JSON.stringify(trackedSettings, null, 2));
                // 현재 저장된 설정 확인
                const currentSettings = getSectionSettings(section);
                console.log(`[DEBUG] 현재 저장된 설정:`, JSON.stringify(currentSettings, null, 2));
                // 프레임 개수 변경 감지
                const frameCountChanged = currentFrameCount !== trackedFrameCount;
                // 설정 변경 감지 (JSON 문자열 비교로 정확한 비교)
                const settingsChanged = JSON.stringify(trackedSettings) !== JSON.stringify(currentSettings);
                console.log(`[DEBUG] 변경 감지 결과:`);
                console.log(`  - 프레임 수 변경: ${frameCountChanged} (${trackedFrameCount} → ${currentFrameCount})`);
                console.log(`  - 설정 변경: ${settingsChanged}`);
                // 변경이 감지되거나 강제 레이아웃 업데이트 필요한 경우
                if (frameCountChanged || settingsChanged) {
                    console.log(`[DEBUG] 변경 감지 - 자동 리사이징 실행`);
                    if (frameCountChanged) {
                        console.log(`[DEBUG] 프레임 수 변경으로 인한 리사이징`);
                    }
                    if (settingsChanged) {
                        console.log(`[DEBUG] 설정 변경으로 인한 리사이징`);
                        console.log(`[DEBUG] 이전 설정:`, JSON.stringify(trackedSettings, null, 2));
                        console.log(`[DEBUG] 새 설정:`, JSON.stringify(currentSettings, null, 2));
                    }
                    // 최신 설정으로 자동 리사이징 실행
                    autoResizeSection(section, currentSettings);
                }
                else {
                    // 변경이 없어도 주기적으로 강제 레이아웃 업데이트 (일관성 유지)
                    if (Math.random() < 0.1) { // 10% 확률로 강제 업데이트
                        console.log(`[DEBUG] 주기적 강제 레이아웃 업데이트`);
                        autoResizeSection(section, currentSettings);
                    }
                    else {
                        console.log(`[DEBUG] 변경 없음 - 건너뜀`);
                    }
                }
            }
            catch (sectionError) {
                console.error(`[DEBUG] 섹션 ${section.name} 처리 중 오류:`, sectionError);
                // 오류 발생 시 해당 섹션을 추적에서 제거하지 않고 재시도
                console.log(`[DEBUG] 섹션 ${section.name} 오류 복구 시도`);
                try {
                    const settings = getSectionSettings(section);
                    trackedSections.set(section.id, {
                        frameCount: section.children.filter(child => child.type === 'FRAME').length,
                        settings: settings
                    });
                    console.log(`[DEBUG] 섹션 ${section.name} 복구 성공`);
                }
                catch (recoveryError) {
                    console.error(`[DEBUG] 섹션 ${section.name} 복구 실패:`, recoveryError);
                    trackedSections.delete(section.id);
                }
            }
        });
        // 존재하지 않는 섹션들을 추적 목록에서 제거
        const existingSectionIds = new Set(allAutoSections.map(s => s.id));
        const trackedIds = Array.from(trackedSections.keys());
        trackedIds.forEach(trackedId => {
            if (!existingSectionIds.has(trackedId)) {
                trackedSections.delete(trackedId);
                console.log(`[DEBUG] 삭제된 섹션 추적 제거: ${trackedId}`);
            }
        });
        console.log(`[DEBUG] ========== 모든 AutoSection 체크 완료 ==========`);
    }
    catch (error) {
        console.error(`[DEBUG] AutoSection 체크 중 치명적 오류:`, error);
    }
}
// 선택 변경 이벤트 리스너 추가
function setupSelectionChangeListener() {
    figma.on('selectionchange', () => {
        if (autoResizeEnabled) {
            // 선택이 변경될 때마다 AutoSection 체크 (삭제 감지)
            setTimeout(() => {
                checkAllAutoSections();
            }, 50); // 50ms 후 체크 (삭제 작업이 완료될 시간)
        }
    });
}
// 자동 리사이징 모니터링 시작 (트리플 감지 시스템)
function startAutoResizeListener() {
    autoResizeEnabled = true;
    // 선택 변경 이벤트 리스너 설정
    setupSelectionChangeListener();
    // 200ms마다 섹션 변경 사항 확인 (주기적 체크)
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
    }
    monitoringInterval = setInterval(() => {
        checkAllAutoSections();
    }, 200);
    console.log(`[DEBUG] 트리플 감지 시스템 활성화:`);
    console.log(`  - 선택 변경 감지: 50ms 디바운스`);
    console.log(`  - 문서 변경 감지: 200ms 딜레이`);
    console.log(`  - 주기적 체크: 200ms 간격`);
    figma.ui.postMessage({
        type: 'info',
        message: '자동 리사이징 모드가 활성화되었습니다.'
    });
}
// 자동 리사이징 중지
function stopAutoResizeListener() {
    autoResizeEnabled = false;
    trackedSections.clear();
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
    }
    if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
    }
    figma.ui.postMessage({
        type: 'info',
        message: '자동 리사이징 모드가 비활성화되었습니다.'
    });
}
// UI에서 오는 메시지 처리 (안정성 강화)
figma.ui.onmessage = (msg) => {
    try {
        console.log(`[DEBUG] UI 메시지 수신:`, msg);
        switch (msg.type) {
            case 'create-section':
                console.log(`[DEBUG] ========== UI에서 섹션 생성 요청 ==========`);
                console.log(`[DEBUG] UI에서 전달된 설정:`, JSON.stringify(msg.settings, null, 2));
                console.log(`[DEBUG] 현재 기본 설정:`, JSON.stringify(DEFAULT_SETTINGS, null, 2));
                if (msg.settings) {
                    const previousSettings = Object.assign({}, currentSettings);
                    currentSettings = Object.assign(Object.assign({}, DEFAULT_SETTINGS), msg.settings);
                    console.log(`[DEBUG] 이전 전역 설정:`, JSON.stringify(previousSettings, null, 2));
                    console.log(`[DEBUG] 새 전역 설정:`, JSON.stringify(currentSettings, null, 2));
                }
                else {
                    console.log(`[DEBUG] UI 설정이 없어 현재 설정 사용:`, JSON.stringify(currentSettings, null, 2));
                }
                console.log(`[DEBUG] 섹션 생성에 사용할 최종 설정:`, JSON.stringify(currentSettings, null, 2));
                createSection(currentSettings);
                break;
            case 'change-direction':
                console.log(`[DEBUG] 섹션 방향 변경 요청:`, msg.settings);
                changeSectionDirection(msg.settings);
                break;
            case 'update-section-settings':
                console.log(`[DEBUG] ========== UI에서 섹션 설정 업데이트 요청 ==========`);
                console.log(`[DEBUG] 요청된 설정:`, JSON.stringify(msg.settings, null, 2));
                if (msg.settings) {
                    // 현재 설정값도 업데이트 (새 섹션 생성시 사용)
                    const previousSettings = Object.assign({}, currentSettings);
                    currentSettings = Object.assign(Object.assign({}, currentSettings), msg.settings);
                    console.log(`[DEBUG] 이전 전역 설정:`, JSON.stringify(previousSettings, null, 2));
                    console.log(`[DEBUG] 새 전역 설정:`, JSON.stringify(currentSettings, null, 2));
                    // 선택된 섹션에도 즉시 적용
                    console.log(`[DEBUG] 선택된 섹션에 즉시 적용 시작`);
                    updateSelectedSectionSettings(msg.settings);
                }
                else {
                    console.warn(`[DEBUG] 설정값이 없어 업데이트 건너뜀`);
                    figma.ui.postMessage({
                        type: 'error',
                        message: '설정값이 전달되지 않았습니다.'
                    });
                }
                break;
            case 'start-auto-resize':
                console.log(`[DEBUG] 자동 리사이징 시작 요청`);
                startAutoResizeListener();
                break;
            case 'stop-auto-resize':
                console.log(`[DEBUG] 자동 리사이징 중지 요청`);
                stopAutoResizeListener();
                break;
            case 'cancel':
                console.log(`[DEBUG] 플러그인 종료 요청`);
                figma.closePlugin();
                break;
            default:
                console.warn(`[DEBUG] 알 수 없는 메시지 타입: ${msg.type}`);
                figma.ui.postMessage({
                    type: 'error',
                    message: `알 수 없는 명령입니다: ${msg.type}`
                });
        }
    }
    catch (error) {
        console.error('UI 메시지 처리 중 오류:', error);
        figma.ui.postMessage({
            type: 'error',
            message: '메시지 처리 중 오류가 발생했습니다.'
        });
    }
};
// 선택 변경 시 정보 업데이트 (디바운스 적용)
let selectionCheckTimer = null;
function debouncedCheckSelectionInfo() {
    if (selectionCheckTimer) {
        clearTimeout(selectionCheckTimer);
    }
    selectionCheckTimer = setTimeout(() => {
        checkSelectionInfo();
    }, 50); // 50ms 디바운스
}
// 선택 변경 시 정보 업데이트
figma.on('selectionchange', () => {
    console.log(`[DEBUG] 선택 변경 이벤트`);
    debouncedCheckSelectionInfo();
    // 자동 리사이징이 활성화된 경우 변경사항 체크
    if (autoResizeEnabled) {
        setTimeout(() => {
            checkAllAutoSections();
        }, 100);
    }
});
// 문서 변경 이벤트 리스너 함수
function setupDocumentChangeListener() {
    try {
        figma.on('documentchange', (event) => {
            try {
                console.log(`[DEBUG] 문서 변경 이벤트:`, event);
                if (!autoResizeEnabled)
                    return;
                // 변경된 노드들 중 AutoSection과 관련된 것들 찾기
                let needsCheck = false;
                for (const change of event.documentChanges) {
                    if (change.type === 'PROPERTY_CHANGE' || change.type === 'CREATE' || change.type === 'DELETE') {
                        const node = change.node;
                        // 변경된 노드가 AutoSection이거나 AutoSection의 자식인지 확인
                        if (node && 'parent' in node) {
                            let current = node;
                            while (current) {
                                if (current.name && current.name.startsWith('AutoSection_')) {
                                    console.log(`[DEBUG] AutoSection 관련 변경 감지: ${current.name}`);
                                    needsCheck = true;
                                    break;
                                }
                                current = current.parent;
                            }
                        }
                    }
                }
                if (needsCheck) {
                    console.log(`[DEBUG] AutoSection 변경사항으로 인한 체크 실행`);
                    setTimeout(() => {
                        checkAllAutoSections();
                    }, 200); // 변경 완료 후 체크
                }
            }
            catch (error) {
                console.error('문서 변경 이벤트 처리 중 오류:', error);
            }
        });
        console.log('[DEBUG] 문서 변경 이벤트 리스너 등록 완료');
    }
    catch (error) {
        console.error('문서 변경 이벤트 리스너 등록 실패:', error);
    }
}
// 플러그인 시작 시 초기화
function initializePlugin() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // 먼저 모든 페이지를 로드 (documentchange 이벤트 리스너를 위해 필요)
            yield figma.loadAllPagesAsync();
            console.log('[DEBUG] 모든 페이지 로드 완료');
            // 문서 변경 이벤트 리스너 설정
            setupDocumentChangeListener();
            // 초기 선택 정보 전송
            checkSelectionInfo();
            // 기존 AutoSection들을 추적 목록에 추가
            function initializeExistingSections(node) {
                if ((node.type === 'SECTION' && node.name.startsWith('AutoSection_')) ||
                    (node.type === 'FRAME' && node.name.startsWith('AutoSection_'))) {
                    const section = node;
                    const frames = section.children.filter(child => child.type === 'FRAME');
                    const settings = getSectionSettings(section);
                    trackedSections.set(section.id, {
                        frameCount: frames.length,
                        settings: settings
                    });
                    console.log(`기존 섹션 추적 시작: ${section.name}, ${frames.length}개 프레임`);
                }
                if ('children' in node) {
                    for (const child of node.children) {
                        initializeExistingSections(child);
                    }
                }
            }
            initializeExistingSections(figma.currentPage);
            // 자동 리사이징 시스템 활성화
            startAutoResizeListener();
            console.log('플러그인 초기화 완료 - 자동 리사이징 활성화됨');
        }
        catch (error) {
            console.error('플러그인 초기화 중 오류:', error);
        }
    });
}
// 플러그인 시작
initializePlugin();
// 플러그인 종료 시 정리 작업
figma.on('close', () => {
    try {
        // 자동 리사이징 중지
        stopAutoResizeListener();
        // 선택 체크 타이머 정리
        if (selectionCheckTimer) {
            clearTimeout(selectionCheckTimer);
            selectionCheckTimer = null;
        }
        // 추적 목록 정리
        trackedSections.clear();
        console.log('플러그인 정리 작업 완료');
    }
    catch (error) {
        console.error('플러그인 정리 중 오류:', error);
    }
});
// 선택된 노드들의 정보 확인 (안정성 강화)
function checkSelectionInfo() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    try {
        console.log(`[DEBUG] ========== 선택 정보 확인 시작 ==========`);
        const selection = figma.currentPage.selection;
        console.log(`[DEBUG] 선택된 노드 수: ${selection.length}`);
        // 선택된 모든 노드 로깅
        selection.forEach((node, index) => {
            console.log(`[DEBUG] 선택 노드 ${index + 1}: ${node.type} - "${node.name}"`);
        });
        const validFrames = selection.filter(node => node.type === 'FRAME' &&
            !node.name.startsWith('AutoSection_'));
        // SECTION 노드 또는 AutoSection_ 프레임 찾기
        const sections = selection.filter(node => (node.type === 'SECTION' && node.name.startsWith('AutoSection_')) ||
            (node.type === 'FRAME' && node.name.startsWith('AutoSection_')));
        console.log(`[DEBUG] 필터링 결과:`);
        console.log(`  - 일반 프레임: ${validFrames.length}개`);
        console.log(`  - AutoSection: ${sections.length}개`);
        // 선택된 섹션이 1개일 때만 방향 정보와 설정 정보 제공
        let selectedSectionDirection = null;
        let sectionSettings = null;
        if (sections.length === 1) {
            const section = sections[0];
            console.log(`[DEBUG] ---------- 선택된 섹션 분석 ----------`);
            console.log(`[DEBUG] 섹션 이름: ${section.name}`);
            console.log(`[DEBUG] 섹션 타입: ${section.type}`);
            console.log(`[DEBUG] 섹션 ID: ${section.id}`);
            try {
                // 방향 정보 가져오기
                selectedSectionDirection = getSectionDirection(section);
                console.log(`[DEBUG] 로드된 방향: ${selectedSectionDirection}`);
                // 전체 설정 정보 가져오기 (최신 상태로)
                sectionSettings = getSectionSettings(section);
                console.log(`[DEBUG] 로드된 설정:`, JSON.stringify(sectionSettings, null, 2));
                // 설정 정보 완전 검증 및 보정
                if (!sectionSettings || typeof sectionSettings !== 'object') {
                    console.warn(`[DEBUG] 잘못된 설정 정보, 기본값 사용`);
                    sectionSettings = Object.assign({}, DEFAULT_SETTINGS);
                }
                // 모든 필드 강제 보완
                sectionSettings = {
                    direction: (sectionSettings.direction === 'horizontal') ? 'horizontal' : 'vertical',
                    margins: {
                        top: Math.max(0, Math.min(200, (_b = (_a = sectionSettings.margins) === null || _a === void 0 ? void 0 : _a.top) !== null && _b !== void 0 ? _b : 40)),
                        bottom: Math.max(0, Math.min(200, (_d = (_c = sectionSettings.margins) === null || _c === void 0 ? void 0 : _c.bottom) !== null && _d !== void 0 ? _d : 40)),
                        left: Math.max(0, Math.min(200, (_f = (_e = sectionSettings.margins) === null || _e === void 0 ? void 0 : _e.left) !== null && _f !== void 0 ? _f : 40)),
                        right: Math.max(0, Math.min(200, (_h = (_g = sectionSettings.margins) === null || _g === void 0 ? void 0 : _g.right) !== null && _h !== void 0 ? _h : 40))
                    },
                    spacing: Math.max(0, Math.min(200, (_j = sectionSettings.spacing) !== null && _j !== void 0 ? _j : 48))
                };
                console.log(`[DEBUG] 최종 설정 (보정 후):`, JSON.stringify(sectionSettings, null, 2));
                // 오류 시 기본값 전송 방지를 위한 강제 재저장
                try {
                    saveSectionSettings(section, sectionSettings);
                    console.log(`[DEBUG] 설정 정보 강제 재저장 완료`);
                }
                catch (saveError) {
                    console.error(`[DEBUG] 설정 재저장 실패:`, saveError);
                }
            }
            catch (settingsError) {
                console.error(`[DEBUG] 설정 로드 중 오류:`, settingsError);
                selectedSectionDirection = 'vertical';
                sectionSettings = Object.assign({}, DEFAULT_SETTINGS);
            }
        }
        else if (sections.length > 1) {
            console.log(`[DEBUG] 여러 섹션 선택됨 (${sections.length}개) - 설정 정보 비활성화`);
        }
        else {
            console.log(`[DEBUG] 선택된 섹션 없음 - 설정 정보 비활성화`);
        }
        // UI로 전송할 메시지 구성
        const messageData = {
            type: 'selection-info',
            framesCount: validFrames.length,
            sectionsCount: sections.length,
            selectedSectionDirection: selectedSectionDirection,
            sectionSettings: sectionSettings
        };
        console.log(`[DEBUG] ---------- UI 전송 데이터 ----------`);
        console.log(`[DEBUG] 프레임 수: ${messageData.framesCount}`);
        console.log(`[DEBUG] 섹션 수: ${messageData.sectionsCount}`);
        console.log(`[DEBUG] 선택된 섹션 방향: ${messageData.selectedSectionDirection}`);
        console.log(`[DEBUG] 섹션 설정:`, messageData.sectionSettings ? JSON.stringify(messageData.sectionSettings, null, 2) : 'null');
        // UI에 메시지 전송
        figma.ui.postMessage(messageData);
        console.log(`[DEBUG] UI에 선택 정보 전송 완료`);
        console.log(`[DEBUG] ========== 선택 정보 확인 완료 ==========`);
    }
    catch (error) {
        console.error(`[DEBUG] 선택 정보 확인 중 치명적 오류:`, error);
        // 오류 발생 시 기본 정보 전송
        try {
            figma.ui.postMessage({
                type: 'selection-info',
                framesCount: 0,
                sectionsCount: 0,
                selectedSectionDirection: null,
                sectionSettings: null
            });
            console.log(`[DEBUG] 오류 복구 - 기본 정보 전송 완료`);
        }
        catch (fallbackError) {
            console.error(`[DEBUG] 기본 정보 전송도 실패:`, fallbackError);
        }
    }
}
// 섹션의 방향 정보를 가져오는 함수 (안정성 강화)
function getSectionDirection(section) {
    try {
        const direction = section.getPluginData("direction");
        console.log(`[DEBUG] 섹션 ${section.name} 방향 로드:`, direction);
        return (direction === 'horizontal') ? 'horizontal' : 'vertical';
    }
    catch (error) {
        console.error('방향 정보 가져오기 실패:', error);
        return 'vertical'; // 기본값
    }
}
// 섹션의 설정 정보를 가져오는 함수 (즉시 읽기 및 검증)
function getSectionSettings(section) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    try {
        console.log(`[READ] ========== 섹션 ${section.name}의 설정 읽기 시작 ==========`);
        // 1단계: 모든 pluginData 즉시 읽기
        const autosectionData = section.getPluginData("autosection");
        const directionData = section.getPluginData("direction");
        const marginsData = section.getPluginData("margins");
        const spacingData = section.getPluginData("spacing");
        console.log(`[READ] 1단계 - 모든 pluginData 상태:`);
        console.log(`  - autosection: ${autosectionData}`);
        console.log(`  - direction: ${directionData}`);
        console.log(`  - margins: ${marginsData}`);
        console.log(`  - spacing: ${spacingData}`);
        // 2단계: 통합 설정 우선 파싱
        if (autosectionData && autosectionData.trim() !== '') {
            try {
                const parsed = JSON.parse(autosectionData);
                console.log(`[READ] 2단계 - 통합 설정 파싱 성공:`, JSON.stringify(parsed, null, 2));
                // 완전한 필드 검증 및 보정
                const settings = {
                    direction: (parsed.direction === 'horizontal') ? 'horizontal' : 'vertical',
                    margins: {
                        top: Math.max(0, Math.min(200, (_b = (_a = parsed.margins) === null || _a === void 0 ? void 0 : _a.top) !== null && _b !== void 0 ? _b : 40)),
                        bottom: Math.max(0, Math.min(200, (_d = (_c = parsed.margins) === null || _c === void 0 ? void 0 : _c.bottom) !== null && _d !== void 0 ? _d : 40)),
                        left: Math.max(0, Math.min(200, (_f = (_e = parsed.margins) === null || _e === void 0 ? void 0 : _e.left) !== null && _f !== void 0 ? _f : 40)),
                        right: Math.max(0, Math.min(200, (_h = (_g = parsed.margins) === null || _g === void 0 ? void 0 : _g.right) !== null && _h !== void 0 ? _h : 40))
                    },
                    spacing: Math.max(0, Math.min(200, (_j = parsed.spacing) !== null && _j !== void 0 ? _j : 48))
                };
                console.log(`[READ] ========== 통합 설정 읽기 완료 ==========`);
                console.log(`[READ] 읽은 설정:`, JSON.stringify(settings, null, 2));
                return settings;
            }
            catch (parseError) {
                console.warn(`[READ] ⚠️ 통합 설정 파싱 실패, 개별 설정으로 전환:`, parseError);
            }
        }
        else {
            console.log(`[READ] 통합 설정이 없거나 비어있음, 개별 설정 시도`);
        }
        // 3단계: 개별 pluginData에서 복원
        console.log(`[READ] 3단계 - 개별 설정으로 복원 시도`);
        // 방향 복원
        const direction = (directionData === 'horizontal') ? 'horizontal' : 'vertical';
        console.log(`[READ] 방향 복원: ${direction}`);
        // 여백 복원
        let margins = { top: 40, bottom: 40, left: 40, right: 40 };
        if (marginsData && marginsData.trim() !== '') {
            try {
                const parsedMargins = JSON.parse(marginsData);
                margins = {
                    top: Math.max(0, Math.min(200, (_k = parsedMargins.top) !== null && _k !== void 0 ? _k : 40)),
                    bottom: Math.max(0, Math.min(200, (_l = parsedMargins.bottom) !== null && _l !== void 0 ? _l : 40)),
                    left: Math.max(0, Math.min(200, (_m = parsedMargins.left) !== null && _m !== void 0 ? _m : 40)),
                    right: Math.max(0, Math.min(200, (_o = parsedMargins.right) !== null && _o !== void 0 ? _o : 40))
                };
                console.log(`[READ] 여백 복원 성공:`, JSON.stringify(margins, null, 2));
            }
            catch (e) {
                console.warn(`[READ] ⚠️ 여백 데이터 파싱 실패, 기본값 사용:`, e);
            }
        }
        else {
            console.log(`[READ] 여백 데이터 없음, 기본값 사용`);
        }
        // 간격 복원
        let spacing = 48;
        if (spacingData && spacingData.trim() !== '') {
            spacing = Math.max(0, Math.min(200, parseInt(spacingData) || 48));
            console.log(`[READ] 간격 복원: ${spacing}`);
        }
        else {
            console.log(`[READ] 간격 데이터 없음, 기본값 사용: ${spacing}`);
        }
        const settings = {
            direction,
            margins,
            spacing
        };
        console.log(`[READ] ========== 개별 설정 읽기 완료 ==========`);
        console.log(`[READ] 최종 읽은 설정:`, JSON.stringify(settings, null, 2));
        return settings;
    }
    catch (error) {
        console.error('섹션 설정 가져오기 실패:', error);
        // 완전한 기본값 반환
        const defaultSettings = {
            direction: 'vertical',
            margins: { top: 40, bottom: 40, left: 40, right: 40 },
            spacing: 48
        };
        console.log(`[DEBUG] 기본값 사용:`, defaultSettings);
        return defaultSettings;
    }
}
// 섹션 설정을 안전하게 저장하는 함수 (즉시 검증 포함)
function saveSectionSettings(section, settings) {
    try {
        console.log(`[SAVE] ========== 섹션 ${section.name} 설정 저장 시작 ==========`);
        console.log(`[SAVE] 저장할 설정:`, JSON.stringify(settings, null, 2));
        // 1단계: 통합 설정 저장
        const settingsJson = JSON.stringify(settings);
        section.setPluginData("autosection", settingsJson);
        console.log(`[SAVE] 1단계 - 통합 설정 저장 완료: ${settingsJson}`);
        // 2단계: 개별 설정 저장 (호환성을 위해)
        section.setPluginData("direction", settings.direction);
        section.setPluginData("margins", JSON.stringify(settings.margins));
        section.setPluginData("spacing", settings.spacing.toString());
        console.log(`[SAVE] 2단계 - 개별 설정 저장 완료`);
        // 3단계: 즉시 저장 검증
        const verifyAutosection = section.getPluginData("autosection");
        const verifyDirection = section.getPluginData("direction");
        const verifyMargins = section.getPluginData("margins");
        const verifySpacing = section.getPluginData("spacing");
        console.log(`[SAVE] 3단계 - 저장 즉시 검증:`);
        console.log(`  - autosection: ${verifyAutosection}`);
        console.log(`  - direction: ${verifyDirection}`);
        console.log(`  - margins: ${verifyMargins}`);
        console.log(`  - spacing: ${verifySpacing}`);
        // 4단계: 저장 성공 여부 확인
        const saveSuccess = (verifyAutosection === settingsJson &&
            verifyDirection === settings.direction &&
            verifyMargins === JSON.stringify(settings.margins) &&
            verifySpacing === settings.spacing.toString());
        if (saveSuccess) {
            console.log(`[SAVE] ========== 설정 저장 성공 확인 ==========`);
            return true;
        }
        else {
            console.error(`[SAVE] ❌ 설정 저장 실패 - 검증 불일치`);
            return false;
        }
    }
    catch (error) {
        console.error('[SAVE] ❌ 섹션 설정 저장 중 오류:', error);
        return false;
    }
}
// 섹션 레이아웃을 즉시 업데이트하는 함수 (완전한 동기화 보장)
function updateSectionLayout(section, newSettings) {
    try {
        console.log(`[LAYOUT] ========== 섹션 ${section.name} 레이아웃 업데이트 시작 ==========`);
        // 1단계: 설정 확보 및 즉시 저장
        let settings;
        if (newSettings) {
            console.log(`[LAYOUT] 1단계 - 전달받은 새 설정 사용:`, JSON.stringify(newSettings, null, 2));
            settings = Object.assign({}, newSettings);
            // 즉시 저장하여 일관성 보장
            console.log(`[LAYOUT] 전달받은 설정을 즉시 저장`);
            const saveSuccess = saveSectionSettings(section, settings);
            if (!saveSuccess) {
                console.error(`[LAYOUT] ❌ 설정 저장 실패, 작업 중단`);
                return;
            }
        }
        else {
            console.log(`[LAYOUT] 1단계 - pluginData에서 설정 읽기`);
            settings = getSectionSettings(section);
        }
        // 2단계: 설정 재검증 (pluginData에서 다시 읽어 확인)
        console.log(`[LAYOUT] 2단계 - 설정 재검증 (즉시 다시 읽기)`);
        const verifiedSettings = getSectionSettings(section);
        console.log(`[LAYOUT] 재검증된 설정:`, JSON.stringify(verifiedSettings, null, 2));
        // 설정 일치성 확인
        const settingsMatch = (verifiedSettings.direction === settings.direction &&
            JSON.stringify(verifiedSettings.margins) === JSON.stringify(settings.margins) &&
            verifiedSettings.spacing === settings.spacing);
        if (!settingsMatch) {
            console.warn(`[LAYOUT] ⚠️ 설정 불일치 감지:`);
            console.warn(`  예상:`, JSON.stringify(settings, null, 2));
            console.warn(`  실제:`, JSON.stringify(verifiedSettings, null, 2));
            console.log(`[LAYOUT] 재검증된 설정으로 계속 진행`);
        }
        // 최종적으로 재검증된 설정 사용
        const finalSettings = verifiedSettings;
        // 3단계: 자식 프레임들 확인
        const frames = section.children.filter(child => child.type === 'FRAME');
        console.log(`[LAYOUT] 3단계 - 자식 프레임 수: ${frames.length}`);
        if (frames.length === 0) {
            console.log(`[LAYOUT] 프레임이 없어 레이아웃 업데이트 건너뜀`);
            return;
        }
        // 4단계: 적용 전 상태 기록
        const beforeWidth = section.width;
        const beforeHeight = section.height;
        console.log(`[LAYOUT] 4단계 - 적용 전 섹션 크기: ${beforeWidth} x ${beforeHeight}`);
        console.log(`[LAYOUT] 최종 적용할 설정:`);
        console.log(`  - 방향: ${finalSettings.direction}`);
        console.log(`  - 여백: top=${finalSettings.margins.top}, bottom=${finalSettings.margins.bottom}, left=${finalSettings.margins.left}, right=${finalSettings.margins.right}`);
        console.log(`  - 간격: ${finalSettings.spacing}`);
        // 5단계: 타입별 레이아웃 적용
        if (section.type === 'SECTION') {
            console.log(`[LAYOUT] 5단계 - SECTION 노드로 레이아웃 적용`);
            // 프레임 정렬
            console.log(`[LAYOUT] 프레임 정렬 시작...`);
            arrangeSectionFrames(section, finalSettings);
            console.log(`[LAYOUT] 프레임 정렬 완료`);
            // 섹션 크기 조정
            console.log(`[LAYOUT] 섹션 크기 조정 시작...`);
            resizeSectionToFitContent(section, finalSettings);
            console.log(`[LAYOUT] 섹션 크기 조정 완료`);
        }
        else {
            console.log(`[LAYOUT] 5단계 - FRAME 노드로 레이아웃 적용`);
            arrangeFrames(section, finalSettings);
            const finalBounds = calculateSectionBounds(section);
            section.resizeWithoutConstraints(finalBounds.width, finalBounds.height);
            console.log(`[LAYOUT] 프레임 크기 조정 완료: ${finalBounds.width} x ${finalBounds.height}`);
        }
        // 6단계: 적용 후 상태 확인
        const afterWidth = section.width;
        const afterHeight = section.height;
        const sizeChanged = beforeWidth !== afterWidth || beforeHeight !== afterHeight;
        console.log(`[LAYOUT] 6단계 - 적용 후 섹션 크기: ${afterWidth} x ${afterHeight}`);
        console.log(`[LAYOUT] 크기 변경: ${sizeChanged ? '있음' : '없음'}`);
        // 7단계: 추적 정보 업데이트
        trackedSections.set(section.id, {
            frameCount: frames.length,
            settings: Object.assign({}, finalSettings)
        });
        console.log(`[LAYOUT] 7단계 - 추적 정보 업데이트 완료`);
        console.log(`[LAYOUT] ========== 레이아웃 업데이트 완료: ${section.name} ==========`);
        console.log(`[LAYOUT] 최종 결과 - 프레임 수: ${frames.length}, 크기 변경: ${sizeChanged ? '있음' : '없음'}`);
    }
    catch (error) {
        console.error('[LAYOUT] ❌ 섹션 레이아웃 업데이트 중 오류:', error);
        console.error('[LAYOUT] 오류 스택:', error === null || error === void 0 ? void 0 : error.stack);
        figma.ui.postMessage({
            type: 'error',
            message: '섹션 레이아웃 업데이트 중 오류가 발생했습니다.'
        });
    }
}
// 선택된 섹션의 방향 변경 (하위 호환성을 위해 유지)
function changeSectionDirection(newSettings) {
    // 새로운 통합 함수 사용
    updateSelectedSectionSettings(newSettings);
    figma.ui.postMessage({
        type: 'success',
        message: `섹션이 ${newSettings.direction === 'vertical' ? '세로' : '가로'} 방향으로 변경되었습니다!`
    });
}
// 선택된 섹션의 설정 업데이트 (완전히 재작성하여 안정성 극대화)
function updateSelectedSectionSettings(newSettings) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    try {
        console.log(`[DEBUG] ========== 섹션 설정 업데이트 시작 ==========`);
        console.log(`[DEBUG] 요청된 새로운 설정:`, JSON.stringify(newSettings, null, 2));
        const selection = figma.currentPage.selection;
        console.log(`[DEBUG] 현재 선택된 노드 수: ${selection.length}`);
        // 선택된 노드들의 타입과 이름 로깅
        selection.forEach((node, index) => {
            console.log(`[DEBUG] 선택된 노드 ${index + 1}: ${node.type} - ${node.name}`);
        });
        // SECTION 노드 또는 AutoSection_ 프레임 찾기
        const sections = selection.filter(node => (node.type === 'SECTION' && node.name.startsWith('AutoSection_')) ||
            (node.type === 'FRAME' && node.name.startsWith('AutoSection_')));
        console.log(`[DEBUG] 찾은 AutoSection 수: ${sections.length}`);
        if (sections.length === 0) {
            console.error(`[DEBUG] AutoSection이 선택되지 않음`);
            figma.ui.postMessage({
                type: 'error',
                message: 'AutoSection을 선택해주세요.'
            });
            return;
        }
        if (sections.length > 1) {
            console.error(`[DEBUG] 여러 AutoSection이 선택됨: ${sections.length}개`);
            figma.ui.postMessage({
                type: 'error',
                message: '하나의 섹션만 선택해주세요.'
            });
            return;
        }
        const section = sections[0];
        console.log(`[DEBUG] 대상 섹션: ${section.name} (${section.type}, ID: ${section.id})`);
        // 현재 설정 확인 (변경 전)
        console.log(`[DEBUG] ---------- 변경 전 상태 확인 ----------`);
        const beforeSettings = getSectionSettings(section);
        console.log(`[DEBUG] 변경 전 설정:`, JSON.stringify(beforeSettings, null, 2));
        // 현재 저장된 pluginData 확인
        const currentPluginData = section.getPluginData("autosection");
        const currentDirection = section.getPluginData("direction");
        const currentMargins = section.getPluginData("margins");
        const currentSpacing = section.getPluginData("spacing");
        console.log(`[DEBUG] 현재 pluginData 상태:`);
        console.log(`  - autosection: ${currentPluginData}`);
        console.log(`  - direction: ${currentDirection}`);
        console.log(`  - margins: ${currentMargins}`);
        console.log(`  - spacing: ${currentSpacing}`);
        // 설정 검증 및 10단계 확인 프로세스
        if (!newSettings || typeof newSettings !== 'object') {
            console.error(`[DEBUG] 잘못된 설정 형식:`, newSettings);
            figma.ui.postMessage({
                type: 'error',
                message: '잘못된 설정 형식입니다.'
            });
            return;
        }
        // 1단계: 설정값 완전 검증 및 보정
        const validatedSettings = {
            direction: newSettings.direction || 'vertical',
            margins: {
                top: Math.max(0, Math.min(200, (_b = (_a = newSettings.margins) === null || _a === void 0 ? void 0 : _a.top) !== null && _b !== void 0 ? _b : 40)),
                bottom: Math.max(0, Math.min(200, (_d = (_c = newSettings.margins) === null || _c === void 0 ? void 0 : _c.bottom) !== null && _d !== void 0 ? _d : 40)),
                left: Math.max(0, Math.min(200, (_f = (_e = newSettings.margins) === null || _e === void 0 ? void 0 : _e.left) !== null && _f !== void 0 ? _f : 40)),
                right: Math.max(0, Math.min(200, (_h = (_g = newSettings.margins) === null || _g === void 0 ? void 0 : _g.right) !== null && _h !== void 0 ? _h : 40))
            },
            spacing: Math.max(0, Math.min(200, (_j = newSettings.spacing) !== null && _j !== void 0 ? _j : 48))
        };
        console.log(`[DEBUG] 1단계 - 검증된 설정:`, JSON.stringify(validatedSettings, null, 2));
        // 2단계: 변경 감지 (정확한 비교)
        const isDirectionChanged = beforeSettings.direction !== validatedSettings.direction;
        const isMarginsChanged = JSON.stringify(beforeSettings.margins) !== JSON.stringify(validatedSettings.margins);
        const isSpacingChanged = beforeSettings.spacing !== validatedSettings.spacing;
        const hasAnyChange = isDirectionChanged || isMarginsChanged || isSpacingChanged;
        console.log(`[DEBUG] 2단계 - 변경 감지 결과:`);
        console.log(`  - 방향 변경: ${isDirectionChanged} (${beforeSettings.direction} → ${validatedSettings.direction})`);
        console.log(`  - 여백 변경: ${isMarginsChanged}`);
        console.log(`  - 간격 변경: ${isSpacingChanged} (${beforeSettings.spacing} → ${validatedSettings.spacing})`);
        console.log(`  - 전체 변경 여부: ${hasAnyChange}`);
        // 3단계: 설정 즉시 저장 및 검증
        console.log(`[SETTING] 3단계 - 설정 즉시 저장 및 검증`);
        const saveSuccess = saveSectionSettings(section, validatedSettings);
        if (!saveSuccess) {
            console.error(`[SETTING] ❌ 설정 저장 실패`);
            figma.ui.postMessage({
                type: 'error',
                message: '설정 저장에 실패했습니다.'
            });
            return;
        }
        // 4단계: 저장 즉시 확인
        console.log(`[SETTING] 4단계 - 저장 즉시 확인`);
        const immediateSettings = getSectionSettings(section);
        console.log(`[SETTING] 저장 즉시 확인된 설정:`, JSON.stringify(immediateSettings, null, 2));
        // pluginData 상태 재확인
        const savedPluginData = section.getPluginData("autosection");
        console.log(`[SETTING] 저장된 pluginData: ${savedPluginData}`);
        // 5단계: 설정 일치성 확인
        console.log(`[SETTING] 5단계 - 설정 일치성 확인`);
        const settingsMatch = (immediateSettings.direction === validatedSettings.direction &&
            JSON.stringify(immediateSettings.margins) === JSON.stringify(validatedSettings.margins) &&
            immediateSettings.spacing === validatedSettings.spacing);
        if (!settingsMatch) {
            console.warn(`[SETTING] ⚠️ 설정 불일치 감지, 재저장 시도`);
            const retrySuccess = saveSectionSettings(section, validatedSettings);
            if (!retrySuccess) {
                console.error(`[SETTING] ❌ 재저장도 실패`);
                return;
            }
            console.log(`[SETTING] 재저장 완료`);
        }
        // 6단계: 레이아웃 즉시 업데이트
        console.log(`[SETTING] 6단계 - 레이아웃 즉시 업데이트`);
        try {
            updateSectionLayout(section, validatedSettings);
            console.log(`[SETTING] 레이아웃 업데이트 완료`);
        }
        catch (layoutError) {
            console.error(`[SETTING] ❌ 레이아웃 업데이트 실패:`, layoutError);
            // 7단계: 오류 복구 시도
            console.log(`[SETTING] 7단계 - 오류 복구 시도`);
            try {
                saveSectionSettings(section, validatedSettings);
                updateSectionLayout(section, validatedSettings);
                console.log(`[SETTING] 복구 업데이트 완료`);
            }
            catch (recoveryError) {
                console.error(`[SETTING] ❌ 복구도 실패:`, recoveryError);
            }
        }
        // 8단계: 추적 정보 즉시 업데이트
        console.log(`[SETTING] 8단계 - 추적 정보 즉시 업데이트`);
        const frames = section.children.filter(child => child.type === 'FRAME');
        trackedSections.set(section.id, {
            frameCount: frames.length,
            settings: Object.assign({}, validatedSettings)
        });
        console.log(`[SETTING] 추적 정보 업데이트 완료: ${frames.length}개 프레임`);
        // 9단계: 최종 상태 즉시 확인
        console.log(`[SETTING] 9단계 - 최종 상태 즉시 확인`);
        const finalSettings = getSectionSettings(section);
        console.log(`[SETTING] 최종 설정:`, JSON.stringify(finalSettings, null, 2));
        // 최종 검증 및 필요시 재적용
        const finalMatch = (finalSettings.direction === validatedSettings.direction &&
            JSON.stringify(finalSettings.margins) === JSON.stringify(validatedSettings.margins) &&
            finalSettings.spacing === validatedSettings.spacing);
        if (!finalMatch) {
            console.warn(`[SETTING] ⚠️ 최종 검증 불일치, 마지막 재적용`);
            updateSectionLayout(section, validatedSettings);
        }
        // 10단계: UI 동기화 및 완료 처리
        console.log(`[SETTING] 10단계 - UI 동기화 및 완료`);
        checkSelectionInfo();
        console.log(`[SETTING] ========== 섹션 설정 업데이트 즉시 완료 ==========`);
        // 성공 메시지 전송
        figma.ui.postMessage({
            type: 'success',
            message: '섹션 설정이 즉시 적용되었습니다!'
        });
    }
    catch (error) {
        console.error('[DEBUG] 섹션 설정 업데이트 중 치명적 오류:', error);
        console.error('[DEBUG] 오류 스택:', error === null || error === void 0 ? void 0 : error.stack);
        figma.ui.postMessage({
            type: 'error',
            message: '섹션 설정 업데이트에 실패했습니다: ' + (error === null || error === void 0 ? void 0 : error.message)
        });
    }
}
