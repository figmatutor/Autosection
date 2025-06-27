// AutoSection 플러그인 - 프레임을 자동으로 섹션으로 그룹화
// 비개발자를 위한 Figma 플러그인

// 플러그인 UI 표시
figma.showUI(__html__, { width: 350, height: 600 });

// 설정 인터페이스
interface SectionSettings {
  direction: 'vertical' | 'horizontal';
  margins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  spacing: number;
  includeText?: boolean; // TextNode 포함 여부 (선택적)
}

// 기본 설정
const DEFAULT_SETTINGS: SectionSettings = {
  direction: 'vertical',
  margins: {
    top: 40,
    bottom: 40,
    left: 40,
    right: 40
  },
  spacing: 48,
  includeText: false // 기본적으로 TextNode 제외
};

// 시각적 노드 타입 정의 (레이아웃에 포함되어야 하는 노드들)
// Images are handled as RectangleNode with fills, LineNode exists in Figma API
type VisualNode = FrameNode | RectangleNode | EllipseNode | PolygonNode | StarNode | VectorNode | 
                  ComponentNode | InstanceNode | GroupNode | BooleanOperationNode | LineNode | TextNode;

// 🚀 고급 성능 최적화를 위한 캐시 시스템
interface AdvancedNodeCache {
  boundingBox: Map<string, { x: number; y: number; width: number; height: number } | null>;
  visualNodeCheck: Map<string, boolean>;
  layoutableChildren: Map<string, VisualNode[]>;
  sectionSettings: Map<string, SectionSettings>;
  nodeHash: Map<string, string>; // 노드 상태 해시 캐싱
  lastCacheUpdate: number;
  hitCount: number;
  missCount: number;
}

const nodeCache: AdvancedNodeCache = {
  boundingBox: new Map(),
  visualNodeCheck: new Map(),
  layoutableChildren: new Map(),
  sectionSettings: new Map(),
  nodeHash: new Map(),
  lastCacheUpdate: 0,
  hitCount: 0,
  missCount: 0
};

// 캐시 유효성 검사 (3초로 단축하여 더 민감하게)
const CACHE_VALIDITY_MS = 3000;

function isCacheValid(): boolean {
  return Date.now() - nodeCache.lastCacheUpdate < CACHE_VALIDITY_MS;
}

function invalidateCache(): void {
  const cacheSize = nodeCache.boundingBox.size + nodeCache.visualNodeCheck.size + 
                   nodeCache.layoutableChildren.size + nodeCache.sectionSettings.size;
  
  console.log(`[PERF] 캐시 무효화: ${cacheSize}개 항목, 히트율: ${Math.round(nodeCache.hitCount / (nodeCache.hitCount + nodeCache.missCount) * 100)}%`);
  
  nodeCache.boundingBox.clear();
  nodeCache.visualNodeCheck.clear();
  nodeCache.layoutableChildren.clear();
  nodeCache.sectionSettings.clear();
  nodeCache.nodeHash.clear();
  nodeCache.lastCacheUpdate = Date.now();
  nodeCache.hitCount = 0;
  nodeCache.missCount = 0;
}

// 🔥 초고속 노드 해시 생성 (변경 감지용)
function getNodeHash(node: SceneNode): string {
  // 노드의 핵심 속성만으로 빠른 해시 생성
  return `${node.id}_${node.visible}_${node.x}_${node.y}_${node.width}_${node.height}_${node.type}`;
}

// 🔥 섹션 상태 해시 생성 (설정 변경 감지용)
function getSectionStateHash(section: SectionNode | FrameNode, settings: SectionSettings): string {
  const childrenHash = section.children.map(child => getNodeHash(child)).join('|');
  const settingsHash = `${settings.direction}_${settings.spacing}_${JSON.stringify(settings.margins)}`;
  return `${section.id}_${settingsHash}_${childrenHash}`;
}

// 시각적 노드 타입 리스트 (상수로 미리 정의)
const VISUAL_NODE_TYPES = new Set([
  'FRAME', 'RECTANGLE', 'ELLIPSE', 'POLYGON', 'STAR', 'VECTOR',
  'COMPONENT', 'INSTANCE', 'GROUP', 'BOOLEAN_OPERATION', 'LINE'
]);

// 🚀 초고속 시각적 노드 검사 (캐싱 적용)
function isVisualNode(node: SceneNode, includeText: boolean = false): node is VisualNode {
  const cacheKey = `${node.id}_${includeText}`;
  
  // 캐시에서 확인
  if (isCacheValid() && nodeCache.visualNodeCheck.has(cacheKey)) {
    nodeCache.hitCount++;
    return nodeCache.visualNodeCheck.get(cacheKey)!;
  }
  
  nodeCache.missCount++;
  
  // 새로운 계산
  let isVisual = VISUAL_NODE_TYPES.has(node.type);
  if (includeText && node.type === 'TEXT') {
    isVisual = true;
  }
  
  // 캐시에 저장
  nodeCache.visualNodeCheck.set(cacheKey, isVisual);
  return isVisual;
}

// 🚀 초고속 레이아웃 가능한 자식 노드 필터링 (스마트 캐싱)
function getLayoutableChildren(section: SectionNode | FrameNode, settings?: SectionSettings): VisualNode[] {
  const startTime = Date.now();
  
  const includeText = settings?.includeText ?? false;
  const cacheKey = `${section.id}_${includeText}_${section.children.length}`;
  
  // 캐시에서 확인
  if (isCacheValid() && nodeCache.layoutableChildren.has(cacheKey)) {
    nodeCache.hitCount++;
    const cached = nodeCache.layoutableChildren.get(cacheKey)!;
    const duration = Date.now() - startTime;
    recordPerformance('getLayoutableChildren', duration);
    return cached;
  }
  
  nodeCache.missCount++;
  
  // 🔥 초고속 필터링: 불필요한 검사 최소화
  const layoutableNodes: VisualNode[] = [];
  const children = section.children;
  
  // 미리 할당된 배열로 성능 향상
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    
    // 1단계: 최우선 필터링 (가장 빠른 검사부터)
    if (!child.visible) continue;
    if (!child.absoluteBoundingBox) continue;
    
    // 2단계: 타입 검사 (캐시된 결과 활용)
    if (isVisualNode(child, includeText)) {
      layoutableNodes.push(child as VisualNode);
    }
  }
  
  // 캐시에 저장
  nodeCache.layoutableChildren.set(cacheKey, layoutableNodes);
  
  // 🧪 성능 로깅
  const duration = Date.now() - startTime;
  recordPerformance('getLayoutableChildren', duration);
  
  if (layoutableNodes.length > 50) {
    console.log(`[PERF] 대용량 섹션 처리: "${section.name}" - ${layoutableNodes.length}개 노드, ${duration}ms`);
  }
  
  return layoutableNodes;
}

// 🚀 고급 성능 측정 시스템
interface PerformanceMetrics {
  checkAllAutoSections: number[];
  autoResizeSection: number[];
  getLayoutableChildren: number[];
  layoutCalculations: number[];
}

const performanceMetrics: PerformanceMetrics = {
  checkAllAutoSections: [],
  autoResizeSection: [],
  getLayoutableChildren: [],
  layoutCalculations: []
};

function recordPerformance(metric: keyof PerformanceMetrics, time: number) {
  performanceMetrics[metric].push(time);
  
  // 최근 10회 기록만 유지
  if (performanceMetrics[metric].length > 10) {
    performanceMetrics[metric].shift();
  }
  
  // 성능 경고 시스템
  const avg = performanceMetrics[metric].reduce((a, b) => a + b, 0) / performanceMetrics[metric].length;
  if (avg > 100) { // 100ms 초과 시 경고
    console.warn(`[PERF] 성능 경고: ${metric} 평균 ${Math.round(avg)}ms`);
  }
}

// 자동 리사이징을 위한 변수들
let autoResizeEnabled = false;
let trackedSections = new Map<string, { 
  frameCount: number; 
  settings: SectionSettings;
  lastHash: string; // 🔥 해시 기반 변경 감지
  lastUpdate: number; // 마지막 업데이트 시간
}>(); 
let debounceTimer: number | null = null;
let throttleTimer: number | null = null;
let monitoringInterval: number | null = null;
let currentSettings: SectionSettings = { ...DEFAULT_SETTINGS };

// 🚀 이벤트 통합 시스템 (중복 실행 방지)
let pendingChecks = new Set<string>();
let lastCheckTime = 0;
const MIN_CHECK_INTERVAL = 150; // 최소 150ms 간격

// 성능 최적화된 디바운스 함수
function debounce(func: Function, delay: number) {
  return (...args: any[]) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      func.apply(null, args);
      debounceTimer = null;
    }, delay) as any;
  };
}

// 스로틀 함수 추가 (이벤트 빈도 제한)
function throttle(func: Function, limit: number) {
  return (...args: any[]) => {
    if (!throttleTimer) {
      func.apply(null, args);
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
      }, limit) as any;
    }
  };
}

// 방향에 따른 프레임 정렬 함수 (오버로드 지원) - 성능 최적화
function arrangeFrames(nodes: VisualNode[], settings: SectionSettings): { width: number; height: number };
function arrangeFrames(section: FrameNode | SectionNode, settings: SectionSettings): void;
function arrangeFrames(input: VisualNode[] | FrameNode | SectionNode, settings: SectionSettings): { width: number; height: number } | void {
  // 섹션인 경우 시각적 자식 노드들을 가져와서 정렬하고 void 반환
  if (input instanceof Array === false) {
    const section = input as FrameNode | SectionNode;
    const visualNodes = getLayoutableChildren(section, settings);
    if (visualNodes.length === 0) return;
    arrangeFramesInternal(visualNodes, settings);
    return; // void 반환
  }
  
  // 노드 배열인 경우 정렬하고 크기 정보 반환
  const nodes = input as VisualNode[];
  return arrangeFramesInternal(nodes, settings);
}

// SECTION 노드용 시각적 노드 정렬 함수 (성능 최적화)
function arrangeSectionFrames(section: SectionNode, settings: SectionSettings): void {
  const visualNodes = getLayoutableChildren(section, settings);
  if (visualNodes.length === 0) return;

  // 성능 최적화: 변경 사항이 있는지 미리 확인
  let needsUpdate = false;
  
  if (settings.direction === 'vertical') {
    // 세로 정렬 - 성능 최적화된 정렬
    visualNodes.sort((a, b) => a.y - b.y);
    
    let currentY = settings.margins.top;
    for (let i = 0; i < visualNodes.length; i++) {
      const node = visualNodes[i];
      const newX = settings.margins.left;
      const newY = currentY;
      
      // 위치 변경이 필요한 경우에만 업데이트
      if (Math.abs(node.x - newX) > 0.1 || Math.abs(node.y - newY) > 0.1) {
        node.x = newX;
        node.y = newY;
        needsUpdate = true;
      }
      
      if (i < visualNodes.length - 1) {
        currentY += node.height + settings.spacing;
      }
    }
    
  } else {
    // 가로 정렬 - 성능 최적화된 정렬
    visualNodes.sort((a, b) => a.x - b.x);
    
    let currentX = settings.margins.left;
    for (let i = 0; i < visualNodes.length; i++) {
      const node = visualNodes[i];
      const newX = currentX;
      const newY = settings.margins.top;
      
      // 위치 변경이 필요한 경우에만 업데이트
      if (Math.abs(node.x - newX) > 0.1 || Math.abs(node.y - newY) > 0.1) {
        node.x = newX;
        node.y = newY;
        needsUpdate = true;
      }
      
      if (i < visualNodes.length - 1) {
        currentX += node.width + settings.spacing;
      }
    }
  }
  
  // 🧪 DEBUG: 성능 정보
  if (needsUpdate && visualNodes.length > 10) {
    console.log(`[PERF] 레이아웃 업데이트: ${visualNodes.length}개 노드 정렬 완료`);
  }
}

// 실제 정렬 로직 (성능 최적화)
function arrangeFramesInternal(nodes: VisualNode[], settings: SectionSettings): { width: number; height: number } {
  if (nodes.length === 0) return { width: 0, height: 0 };

  let totalWidth = 0;
  let totalHeight = 0;
  let maxWidth = 0;
  let maxHeight = 0;

  if (settings.direction === 'vertical') {
    // 세로 정렬 - for 루프로 최적화
    nodes.sort((a, b) => a.y - b.y);
    
    let currentY = settings.margins.top;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      maxWidth = Math.max(maxWidth, node.width);
      
      node.x = settings.margins.left;
      node.y = currentY;
      
      if (i < nodes.length - 1) {
        currentY += node.height + settings.spacing;
      } else {
        currentY += node.height;
      }
    }
    
    totalWidth = maxWidth + settings.margins.left + settings.margins.right;
    totalHeight = currentY + settings.margins.bottom;
    
  } else {
    // 가로 정렬 - for 루프로 최적화
    nodes.sort((a, b) => a.x - b.x);
    
    let currentX = settings.margins.left;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      maxHeight = Math.max(maxHeight, node.height);
      
      node.x = currentX;
      node.y = settings.margins.top;
      
      if (i < nodes.length - 1) {
        currentX += node.width + settings.spacing;
      } else {
        currentX += node.width;
      }
    }
    
    totalWidth = currentX + settings.margins.right;
    totalHeight = maxHeight + settings.margins.top + settings.margins.bottom;
  }

  return { width: totalWidth, height: totalHeight };
}

// 캐싱된 boundingBox 계산 함수
function calculateBounds(frames: readonly SceneNode[]): { x: number; y: number; width: number; height: number } {
  if (frames.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  // 캐시 키 생성
  const cacheKey = frames.map(f => f.id).sort().join('_');
  
  // 캐시에서 확인
  if (isCacheValid() && nodeCache.boundingBox.has(cacheKey)) {
    const cached = nodeCache.boundingBox.get(cacheKey);
    if (cached) return cached;
  }

  // 새로운 계산 - for 루프로 최적화
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    if (!frame.absoluteBoundingBox) continue;
    
    const bounds = frame.absoluteBoundingBox;
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
  }

  const result = {
    x: minX === Infinity ? 0 : minX,
    y: minY === Infinity ? 0 : minY,
    width: maxX === -Infinity ? 0 : maxX - minX,
    height: maxY === -Infinity ? 0 : maxY - minY
  };

  // 캐시에 저장
  nodeCache.boundingBox.set(cacheKey, result);
  return result;
}

// 섹션 크기 계산 함수 (캐싱 적용)
function calculateSectionBounds(section: FrameNode | SectionNode, settings?: SectionSettings): { width: number; height: number } {
  const cacheKey = `section_${section.id}_${JSON.stringify(settings)}`;
  
  // 캐시에서 확인
  if (isCacheValid() && nodeCache.boundingBox.has(cacheKey)) {
    const cached = nodeCache.boundingBox.get(cacheKey);
    if (cached) return { width: cached.width, height: cached.height };
  }

  const sectionSettings = settings || getSectionSettings(section);
  const visualNodes = getLayoutableChildren(section, sectionSettings);
  
  if (visualNodes.length === 0) {
    const result = { width: 100, height: 100 };
    nodeCache.boundingBox.set(cacheKey, { x: 0, y: 0, ...result });
    return result;
  }

  const result = arrangeFrames(visualNodes, sectionSettings);
  
  // 캐시에 저장
  nodeCache.boundingBox.set(cacheKey, { x: 0, y: 0, ...result });
  return result;
}

// 섹션을 콘텐츠에 맞게 리사이징 (성능 최적화)
function resizeSectionToFitContent(section: SectionNode, settings: SectionSettings): void {
  try {
    const bounds = calculateSectionBounds(section, settings);
    
    // 크기 변경이 필요한 경우에만 업데이트
    const threshold = 0.1;
    if (Math.abs(section.width - bounds.width) > threshold || 
        Math.abs(section.height - bounds.height) > threshold) {
      
      section.resizeWithoutConstraints(bounds.width, bounds.height);
      
      // 🧪 DEBUG: 리사이징 정보
      console.log(`[PERF] 섹션 리사이징: "${section.name}" ${bounds.width}x${bounds.height}`);
    }
  } catch (error) {
    console.error('[ERROR] 섹션 리사이징 실패:', error);
  }
}

// 섹션 생성 함수 (안정성 강화)
function createSection(settings: SectionSettings): void {
  try {
    console.log(`[DEBUG] 섹션 생성 시작, 설정:`, settings);
    
    const selection = figma.currentPage.selection;
    const includeText = settings.includeText ?? false;
    
    // 🧪 DEBUG: 선택된 모든 노드 정보 출력
    console.log(`[DEBUG] 총 선택된 노드 수: ${selection.length}`);
    selection.forEach((node, index) => {
      console.log(`[DEBUG] 선택된 노드 ${index + 1}: 타입=${node.type}, 이름="${node.name}", visible=${node.visible}, AutoSection=${node.name.startsWith('AutoSection_')}`);
    });
    
    const validNodes = selection.filter(node => 
      isVisualNode(node, includeText) && 
      node.visible && 
      !node.name.startsWith('AutoSection_')
    ) as VisualNode[];

    // 🧪 DEBUG: 필터링 결과 상세 출력
    console.log(`[DEBUG] 필터링 후 유효한 노드 수: ${validNodes.length}`);
    validNodes.forEach((node, index) => {
      console.log(`[DEBUG] 유효 노드 ${index + 1}: 타입=${node.type}, 이름="${node.name}"`);
    });

    if (validNodes.length < 2) {
      const nodeTypes = validNodes.map(node => node.type).join(', ');
      const selectedCount = figma.currentPage.selection.length;
      const allNodeTypes = selection.map(node => node.type).join(', ');
      
      console.log(`[DEBUG] ❌ 유효 노드 부족: 전체 타입=[${allNodeTypes}], 유효 타입=[${nodeTypes}]`);
      
      figma.ui.postMessage({ 
        type: 'error', 
        message: `최소 2개 이상의 시각적 객체를 선택해주세요. (선택됨: ${selectedCount}개, 유효: ${validNodes.length}개${nodeTypes ? `, 타입: ${nodeTypes}` : ''})` 
      });
      return;
    }

    // 자동 리사이징이 비활성화되어 있다면 활성화
    if (!autoResizeEnabled) {
      console.log(`[DEBUG] 자동 리사이징 시작`);
      startAutoResizeListener();
    }

    // 노드들의 전체 영역 계산
    const bounds = calculateBounds(validNodes);
    
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
    
    // 각 노드를 섹션으로 이동
    validNodes.forEach(node => {
      section.appendChild(node);
    });
    console.log(`[DEBUG] ${validNodes.length}개 노드를 섹션으로 이동 완료`);
    
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
      const settingsMatch = (
        verifySettings.direction === savedSettings.direction &&
        JSON.stringify(verifySettings.margins) === JSON.stringify(savedSettings.margins) &&
        verifySettings.spacing === savedSettings.spacing
      );
      
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
      
    } catch (layoutError) {
      console.error(`[CREATE] ❌ 레이아웃 적용 실패:`, layoutError);
      
      // Fallback: 기본 방식으로 적용
      console.log(`[CREATE] Fallback 레이아웃 적용 시도`);
      try {
        arrangeSectionFrames(section, settings);
        resizeSectionToFitContent(section, settings);
        console.log(`[CREATE] Fallback 레이아웃 적용 완료`);
      } catch (fallbackError) {
        console.error(`[CREATE] ❌ Fallback도 실패:`, fallbackError);
      }
    }
    
    // 4단계: 추적 정보에 즉시 추가
    trackedSections.set(section.id, { 
      frameCount: validNodes.length, 
      settings: { ...savedSettings },
      lastHash: getSectionStateHash(section, savedSettings),
      lastUpdate: Date.now()
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
    console.log(`[DEBUG] 노드 수: ${validNodes.length}개`);
    console.log(`[DEBUG] 최종 섹션 크기: ${section.width} x ${section.height}`);
    console.log(`[DEBUG] 적용된 설정 - 방향: ${savedSettings.direction}, 여백: ${JSON.stringify(savedSettings.margins)}, 간격: ${savedSettings.spacing}`);
    
    figma.ui.postMessage({ 
      type: 'success', 
      message: `${validNodes.length}개 객체로 섹션이 생성되었습니다!` 
    });
    
  } catch (error) {
    console.error('섹션 생성 중 오류:', error);
    figma.ui.postMessage({
      type: 'error',
      message: '섹션 생성 중 오류가 발생했습니다.'
    });
  }
}

// 섹션 내 프레임이 변경되었을 때 자동 리사이징 (완전히 재작성하여 안정성 극대화)
// 🚀 초고속 자동 리사이징 함수 (성능 최적화)
function autoResizeSection(section: SectionNode | FrameNode, customSettings?: SectionSettings) {
  const startTime = Date.now();
  
  try {
    // 🔥 설정 캐싱으로 빠른 접근
    const settings = customSettings || getCachedSectionSettings(section);
    
    // 🔥 미리 계산된 노드 목록 사용
    const visualNodes = getLayoutableChildren(section, settings);
    
    // 빈 섹션 처리 (빠른 종료)
    if (visualNodes.length === 0) {
      const minWidth = settings.margins.left + settings.margins.right;
      const minHeight = settings.margins.top + settings.margins.bottom;
      
      section.resizeWithoutConstraints(Math.max(minWidth, 100), Math.max(minHeight, 100));
      trackedSections.delete(section.id);
      
      const duration = Date.now() - startTime;
      recordPerformance('autoResizeSection', duration);
      return;
    }

    // 🔥 타입별 최적화된 처리
    if (section.type === 'SECTION') {
      // SECTION 타입: 정렬 + 리사이징
      arrangeSectionFrames(section as SectionNode, settings);
      resizeSectionToFitContent(section as SectionNode, settings);
      
    } else {
      // FRAME 타입: 빠른 크기 계산 및 적용
      const { width, height } = arrangeFrames(visualNodes, settings);
      
      // 🔥 변경 감지 최적화: 임계값 이상일 때만 업데이트
      const CHANGE_THRESHOLD = 1;
      const widthDiff = Math.abs(section.width - width);
      const heightDiff = Math.abs(section.height - height);
      
      if (widthDiff > CHANGE_THRESHOLD || heightDiff > CHANGE_THRESHOLD) {
        section.resizeWithoutConstraints(Math.max(width, 100), Math.max(height, 100));
      }
    }

    // 🔥 추적 정보 업데이트 (해시 기반)
    const newHash = getSectionStateHash(section, settings);
    trackedSections.set(section.id, { 
      frameCount: visualNodes.length, 
      settings: settings,
      lastHash: newHash,
      lastUpdate: Date.now()
    });

    // 성능 측정 기록
    const duration = Date.now() - startTime;
    recordPerformance('autoResizeSection', duration);
    
    // 성능 로깅 (임계값 초과 시만)
    if (duration > 50) {
      console.log(`[PERF] 리사이징 완료: "${section.name}" ${duration}ms (${visualNodes.length}개 노드)`);
    }

  } catch (error) {
    console.error(`[PERF] 리사이징 오류: "${section?.name}"`, error);
    
    // 🚀 빠른 오류 복구
    try {
      if (section.type === 'SECTION') {
        resizeSectionToFitContent(section as SectionNode, DEFAULT_SETTINGS);
      } else {
        const bounds = calculateSectionBounds(section);
        section.resizeWithoutConstraints(Math.max(bounds.width, 100), Math.max(bounds.height, 100));
      }
    } catch (recoveryError) {
      // 복구 불가능한 경우 추적에서 제거
      trackedSections.delete(section.id);
    }
    
    const duration = Date.now() - startTime;
    recordPerformance('autoResizeSection', duration);
  }
}

// 성능 최적화된 AutoSection 검색 함수
function findAutoSections(node: BaseNode): (SectionNode | FrameNode)[] {
  const sections: (SectionNode | FrameNode)[] = [];
  
  // 빠른 사전 필터링: AutoSection_로 시작하지 않는 노드는 자식만 탐색
  if (!node.name.startsWith('AutoSection_')) {
    if ('children' in node) {
      for (let i = 0; i < node.children.length; i++) {
        sections.push(...findAutoSections(node.children[i]));
      }
    }
    return sections;
  }
  
  // AutoSection_로 시작하는 노드만 타입 검사
  if (node.type === 'SECTION' || node.type === 'FRAME') {
    sections.push(node as SectionNode | FrameNode);
  }
  
  if ('children' in node) {
    for (let i = 0; i < node.children.length; i++) {
      sections.push(...findAutoSections(node.children[i]));
    }
  }
  
  return sections;
}

// 성능 최적화된 checkAllAutoSections 함수
// 🚀 혁신적인 스마트 변경 감지 시스템
function checkAllAutoSections() {
  if (!autoResizeEnabled) return;
  
  // 🔥 중복 실행 방지 시스템
  const now = Date.now();
  if (now - lastCheckTime < MIN_CHECK_INTERVAL) {
    console.log(`[PERF] 중복 실행 방지: ${now - lastCheckTime}ms 경과 (최소 ${MIN_CHECK_INTERVAL}ms 필요)`);
    return;
  }
  lastCheckTime = now;

  const startTime = Date.now();
  
  try {
    const allAutoSections = findAutoSections(figma.currentPage);
    
    // 🧪 성능 로깅
    if (allAutoSections.length > 5) {
      console.log(`[PERF] 검사 시작: ${allAutoSections.length}개 AutoSection`);
    }

    let updatedCount = 0;
    let skippedCount = 0;

    // 🔥 초고속 변경 감지: 해시 기반 비교
    for (let i = 0; i < allAutoSections.length; i++) {
      const section = allAutoSections[i];
      
      try {
        const sectionSettings = getCachedSectionSettings(section);
        const currentHash = getSectionStateHash(section, sectionSettings);
        const tracked = trackedSections.get(section.id);
        
        if (!tracked) {
          // 새로 발견된 섹션 등록
          const nodeCount = getLayoutableChildren(section, sectionSettings).length;
          trackedSections.set(section.id, {
            frameCount: nodeCount,
            settings: sectionSettings,
            lastHash: currentHash,
            lastUpdate: now
          });
          console.log(`[PERF] 새 섹션 등록: "${section.name}" (${nodeCount}개 노드)`);
          continue;
        }
        
        // 🔥 해시 기반 초고속 변경 감지
        if (tracked.lastHash === currentHash) {
          skippedCount++;
          continue; // 변경 없음 - 즉시 스킵
        }
        
        // 변경 감지됨 - 상세 분석 실행
        const currentNodeCount = getLayoutableChildren(section, sectionSettings).length;
        const frameCountChanged = currentNodeCount !== tracked.frameCount;
        
        console.log(`[PERF] 변경 감지: "${section.name}" 해시변경=${tracked.lastHash !== currentHash}, 노드수=${frameCountChanged ? `${tracked.frameCount}→${currentNodeCount}` : '동일'}`);
        
        // 🚀 스마트 리사이징 (변경된 것만)
        const resizeStartTime = Date.now();
        autoResizeSection(section, sectionSettings);
        const resizeDuration = Date.now() - resizeStartTime;
        recordPerformance('autoResizeSection', resizeDuration);
        
        // 추적 정보 업데이트
        trackedSections.set(section.id, {
          frameCount: currentNodeCount,
          settings: sectionSettings,
          lastHash: currentHash,
          lastUpdate: now
        });
        
        updatedCount++;
        
      } catch (sectionError) {
        console.error(`[PERF] 섹션 처리 오류: "${section.name}"`, sectionError);
        
        // 🚀 스마트 복구: 기본 설정으로 재등록
        try {
          const defaultSettings = { ...DEFAULT_SETTINGS };
          const nodeCount = getLayoutableChildren(section, defaultSettings).length;
          trackedSections.set(section.id, {
            frameCount: nodeCount,
            settings: defaultSettings,
            lastHash: getSectionStateHash(section, defaultSettings),
            lastUpdate: now
          });
        } catch (recoveryError) {
          console.error(`[PERF] 복구 실패: "${section.name}"`, recoveryError);
          trackedSections.delete(section.id);
        }
      }
    }
    
    // 🔥 삭제된 섹션 정리 (성능 최적화)
    if (trackedSections.size > allAutoSections.length) {
      const existingSectionIds = new Set(allAutoSections.map(s => s.id));
      const toDelete: string[] = [];
      
      for (const trackedId of trackedSections.keys()) {
        if (!existingSectionIds.has(trackedId)) {
          toDelete.push(trackedId);
        }
      }
      
      for (const id of toDelete) {
        trackedSections.delete(id);
      }
      
      if (toDelete.length > 0) {
        console.log(`[PERF] 삭제된 섹션 정리: ${toDelete.length}개`);
      }
    }
    
    // 🧪 성능 리포트
    const totalDuration = Date.now() - startTime;
    recordPerformance('checkAllAutoSections', totalDuration);
    
    if (totalDuration > 50 || updatedCount > 0) {
      console.log(`[PERF] 검사 완료: ${totalDuration}ms, 업데이트=${updatedCount}개, 스킵=${skippedCount}개, 전체=${allAutoSections.length}개`);
    }
    
  } catch (error) {
    console.error(`[PERF] 치명적 오류:`, error);
  }
}

// 🚀 캐시된 섹션 설정 가져오기 (중복 호출 방지)
function getCachedSectionSettings(section: SectionNode | FrameNode): SectionSettings {
  const cacheKey = section.id;
  
  // 캐시에서 먼저 확인
  if (isCacheValid() && nodeCache.sectionSettings.has(cacheKey)) {
    nodeCache.hitCount++;
    return nodeCache.sectionSettings.get(cacheKey)!;
  }
  
  nodeCache.missCount++;
  
  // 새로 계산
  const settings = getSectionSettings(section);
  
  // 캐시에 저장
  nodeCache.sectionSettings.set(cacheKey, settings);
  
  return settings;
}

// 🚀 통합된 이벤트 처리 시스템 (중복 방지)
const UNIFIED_CHECK_DELAY = 200; // 통합 검사 지연 시간
let unifiedCheckTimer: number | null = null;

function scheduleUnifiedCheck(reason: string) {
  if (!autoResizeEnabled) return;
  
  // 기존 타이머 취소
  if (unifiedCheckTimer) {
    clearTimeout(unifiedCheckTimer);
  }
  
  // 새로운 통합 검사 예약
  unifiedCheckTimer = setTimeout(() => {
    console.log(`[PERF] 통합 검사 실행: ${reason}`);
    checkAllAutoSections();
    unifiedCheckTimer = null;
  }, UNIFIED_CHECK_DELAY) as any;
}

// 🚀 최적화된 이벤트 리스너 설정
function setupOptimizedEventListeners() {
  // 선택 변경 이벤트 (debounced)
  figma.on('selectionchange', () => {
    scheduleUnifiedCheck('selection-change');
  });
}

// 🚀 초고속 자동 리사이징 시스템 시작
function startAutoResizeListener() {
  autoResizeEnabled = true;
  lastCheckTime = 0;
  
  // 캐시 무효화
  invalidateCache();
  
  // 최적화된 이벤트 리스너 설정
  setupOptimizedEventListeners();
  
  // 🔥 스마트 간격 조정: 더 긴 간격으로 CPU 부하 감소
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
  }
  
  // 500ms 간격으로 더 여유롭게 (이벤트 기반이 주가 됨)
  monitoringInterval = setInterval(() => {
    scheduleUnifiedCheck('periodic-check');
  }, 500) as any;
  
  console.log(`[PERF] 🚀 초고속 자동 리사이징 시스템 활성화 (통합 이벤트, ${UNIFIED_CHECK_DELAY}ms 지연)`);
  
  // 🧪 성능 통계 주기적 리포트 (30초마다)
  setInterval(() => {
    printPerformanceStats();
  }, 30000);
  
  figma.ui.postMessage({
    type: 'info',
    message: '🚀 고성능 자동 리사이징 모드가 활성화되었습니다.'
  });
}

// 🧪 성능 통계 출력 함수
function printPerformanceStats() {
  const cacheHitRate = nodeCache.hitCount + nodeCache.missCount > 0 
    ? Math.round((nodeCache.hitCount / (nodeCache.hitCount + nodeCache.missCount)) * 100) 
    : 0;
  
  console.log(`[PERF] === 성능 통계 ===`);
  console.log(`캐시 히트율: ${cacheHitRate}% (히트: ${nodeCache.hitCount}, 미스: ${nodeCache.missCount})`);
  console.log(`추적 중인 섹션: ${trackedSections.size}개`);
  
  // 각 함수별 평균 실행 시간
  const metricNames: (keyof PerformanceMetrics)[] = ['checkAllAutoSections', 'autoResizeSection', 'getLayoutableChildren', 'layoutCalculations'];
  
  for (const metric of metricNames) {
    const times = performanceMetrics[metric];
    if (times.length > 0) {
      const avg = Math.round(times.reduce((a: number, b: number) => a + b, 0) / times.length);
      const max = Math.round(Math.max(...times));
      console.log(`${metric}: 평균 ${avg}ms, 최대 ${max}ms (${times.length}회)`);
    }
  }
}

// 자동 리사이징 중지 (성능 최적화)
function stopAutoResizeListener() {
  autoResizeEnabled = false;
  trackedSections.clear();
  
  // 캐시 정리
  invalidateCache();
  
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
  }
  
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  
  if (throttleTimer) {
    clearTimeout(throttleTimer);
    throttleTimer = null;
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
          const previousSettings = { ...currentSettings };
          currentSettings = { ...DEFAULT_SETTINGS, ...msg.settings };
          console.log(`[DEBUG] 이전 전역 설정:`, JSON.stringify(previousSettings, null, 2));
          console.log(`[DEBUG] 새 전역 설정:`, JSON.stringify(currentSettings, null, 2));
        } else {
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
          const previousSettings = { ...currentSettings };
          currentSettings = { ...currentSettings, ...msg.settings };
          console.log(`[DEBUG] 이전 전역 설정:`, JSON.stringify(previousSettings, null, 2));
          console.log(`[DEBUG] 새 전역 설정:`, JSON.stringify(currentSettings, null, 2));
          
          // 선택된 섹션에도 즉시 적용
          console.log(`[DEBUG] 선택된 섹션에 즉시 적용 시작`);
          updateSelectedSectionSettings(msg.settings);
        } else {
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
    
  } catch (error) {
    console.error('UI 메시지 처리 중 오류:', error);
    figma.ui.postMessage({
      type: 'error',
      message: '메시지 처리 중 오류가 발생했습니다.'
    });
  }
};

// 선택 변경 시 정보 업데이트 (디바운스 적용)
let selectionCheckTimer: number | null = null;

function debouncedCheckSelectionInfo() {
  if (selectionCheckTimer) {
    clearTimeout(selectionCheckTimer);
  }
  
  selectionCheckTimer = setTimeout(() => {
    checkSelectionInfo();
  }, 50) as any; // 50ms 디바운스
}

// 선택 변경 시 정보 업데이트
figma.on('selectionchange', () => {
  console.log(`[DEBUG] 선택 변경 이벤트`);
  debouncedCheckSelectionInfo();
  
  // 자동 리사이징이 활성화된 경우 변경사항 체크 (통합 시스템 사용)
  if (autoResizeEnabled) {
    scheduleUnifiedCheck('legacy-selection-change');
  }
});

// 문서 변경 이벤트 리스너 함수
function setupDocumentChangeListener() {
  try {
    figma.on('documentchange', (event) => {
      try {
        console.log(`[DEBUG] 문서 변경 이벤트:`, event);
        
        if (!autoResizeEnabled) return;
        
        // 변경된 노드들 중 AutoSection과 관련된 것들 찾기
        let needsCheck = false;
        
        for (const change of event.documentChanges) {
          if (change.type === 'PROPERTY_CHANGE' || change.type === 'CREATE' || change.type === 'DELETE') {
            const node = change.node;
            
            // 변경된 노드가 AutoSection이거나 AutoSection의 자식인지 확인
            if (node && 'parent' in node) {
              let current = node as any;
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
          console.log(`[PERF] AutoSection 변경사항으로 인한 체크 실행 (통합 시스템)`);
          scheduleUnifiedCheck('document-change');
        }
        
      } catch (error) {
        console.error('문서 변경 이벤트 처리 중 오류:', error);
      }
    });
    console.log('[DEBUG] 문서 변경 이벤트 리스너 등록 완료');
  } catch (error) {
    console.error('문서 변경 이벤트 리스너 등록 실패:', error);
  }
}

// 플러그인 시작 시 초기화
async function initializePlugin() {
  try {
    // 먼저 모든 페이지를 로드 (documentchange 이벤트 리스너를 위해 필요)
    await figma.loadAllPagesAsync();
    console.log('[DEBUG] 모든 페이지 로드 완료');
    
    // 문서 변경 이벤트 리스너 설정
    setupDocumentChangeListener();
    
    // 초기 선택 정보 전송
    checkSelectionInfo();
    
    // 기존 AutoSection들을 추적 목록에 추가
    function initializeExistingSections(node: BaseNode): void {
      if ((node.type === 'SECTION' && node.name.startsWith('AutoSection_')) ||
          (node.type === 'FRAME' && node.name.startsWith('AutoSection_'))) {
        const section = node as SectionNode | FrameNode;
        const visualNodes = getLayoutableChildren(section);
        const settings = getSectionSettings(section);
        
        trackedSections.set(section.id, {
          frameCount: visualNodes.length,
          settings: settings,
          lastHash: getSectionStateHash(section, settings),
          lastUpdate: Date.now()
        });
        
        console.log(`기존 섹션 추적 시작: ${section.name}, ${visualNodes.length}개 시각적 노드`);
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
    
  } catch (error) {
    console.error('플러그인 초기화 중 오류:', error);
  }
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
  } catch (error) {
    console.error('플러그인 정리 중 오류:', error);
  }
});

// 선택된 노드들의 정보 확인 (안정성 강화)
function checkSelectionInfo(): void {
  try {
    console.log(`[DEBUG] ========== 선택 정보 확인 시작 ==========`);
    
    const selection = figma.currentPage.selection;
    console.log(`[DEBUG] 선택된 노드 수: ${selection.length}`);
    
    // 선택된 모든 노드 로깅
    selection.forEach((node, index) => {
      console.log(`[DEBUG] 선택 노드 ${index + 1}: ${node.type} - "${node.name}"`);
    });
    
        const validNodes = selection.filter(node => 
      isVisualNode(node) &&
      node.visible &&
      !node.name.startsWith('AutoSection_')
    );

    // SECTION 노드 또는 AutoSection_ 프레임 찾기
    const sections = selection.filter(node => 
      (node.type === 'SECTION' && node.name.startsWith('AutoSection_')) ||
      (node.type === 'FRAME' && node.name.startsWith('AutoSection_'))
    ) as (FrameNode | SectionNode)[];

    console.log(`[DEBUG] 필터링 결과:`);
    console.log(`  - 시각적 노드: ${validNodes.length}개`);
    console.log(`  - AutoSection: ${sections.length}개`);

    // 선택된 섹션이 1개일 때만 방향 정보와 설정 정보 제공
    let selectedSectionDirection: string | null = null;
    let sectionSettings: SectionSettings | null = null;
    
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
          sectionSettings = { ...DEFAULT_SETTINGS };
        }
        
        // 모든 필드 강제 보완
        sectionSettings = {
          direction: (sectionSettings.direction === 'horizontal') ? 'horizontal' : 'vertical',
          margins: {
            top: Math.max(0, Math.min(200, sectionSettings.margins?.top ?? 40)),
            bottom: Math.max(0, Math.min(200, sectionSettings.margins?.bottom ?? 40)),
            left: Math.max(0, Math.min(200, sectionSettings.margins?.left ?? 40)),
            right: Math.max(0, Math.min(200, sectionSettings.margins?.right ?? 40))
          },
          spacing: Math.max(0, Math.min(200, sectionSettings.spacing ?? 48))
        };
        
        console.log(`[DEBUG] 최종 설정 (보정 후):`, JSON.stringify(sectionSettings, null, 2));
        
        // 오류 시 기본값 전송 방지를 위한 강제 재저장
        try {
          saveSectionSettings(section, sectionSettings);
          console.log(`[DEBUG] 설정 정보 강제 재저장 완료`);
        } catch (saveError) {
          console.error(`[DEBUG] 설정 재저장 실패:`, saveError);
        }
        
      } catch (settingsError) {
        console.error(`[DEBUG] 설정 로드 중 오류:`, settingsError);
        selectedSectionDirection = 'vertical';
        sectionSettings = { ...DEFAULT_SETTINGS };
      }
      
    } else if (sections.length > 1) {
      console.log(`[DEBUG] 여러 섹션 선택됨 (${sections.length}개) - 설정 정보 비활성화`);
    } else {
      console.log(`[DEBUG] 선택된 섹션 없음 - 설정 정보 비활성화`);
    }

    // UI로 전송할 메시지 구성
    const messageData = {
      type: 'selection-info', 
      framesCount: validNodes.length,
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
    
  } catch (error) {
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
    } catch (fallbackError) {
      console.error(`[DEBUG] 기본 정보 전송도 실패:`, fallbackError);
    }
  }
}

// 섹션의 방향 정보를 가져오는 함수 (안정성 강화)
function getSectionDirection(section: FrameNode | SectionNode): 'vertical' | 'horizontal' {
  try {
    const direction = section.getPluginData("direction");
    console.log(`[DEBUG] 섹션 ${section.name} 방향 로드:`, direction);
    return (direction === 'horizontal') ? 'horizontal' : 'vertical';
  } catch (error) {
    console.error('방향 정보 가져오기 실패:', error);
    return 'vertical'; // 기본값
  }
}

// 섹션의 설정 정보를 가져오는 함수 (즉시 읽기 및 검증)
function getSectionSettings(section: FrameNode | SectionNode): SectionSettings {
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
        const settings: SectionSettings = {
          direction: (parsed.direction === 'horizontal') ? 'horizontal' : 'vertical',
          margins: {
            top: Math.max(0, Math.min(200, parsed.margins?.top ?? 40)),
            bottom: Math.max(0, Math.min(200, parsed.margins?.bottom ?? 40)),
            left: Math.max(0, Math.min(200, parsed.margins?.left ?? 40)),
            right: Math.max(0, Math.min(200, parsed.margins?.right ?? 40))
          },
          spacing: Math.max(0, Math.min(200, parsed.spacing ?? 48))
        };
        
        console.log(`[READ] ========== 통합 설정 읽기 완료 ==========`);
        console.log(`[READ] 읽은 설정:`, JSON.stringify(settings, null, 2));
        return settings;
        
      } catch (parseError) {
        console.warn(`[READ] ⚠️ 통합 설정 파싱 실패, 개별 설정으로 전환:`, parseError);
      }
    } else {
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
          top: Math.max(0, Math.min(200, parsedMargins.top ?? 40)),
          bottom: Math.max(0, Math.min(200, parsedMargins.bottom ?? 40)),
          left: Math.max(0, Math.min(200, parsedMargins.left ?? 40)),
          right: Math.max(0, Math.min(200, parsedMargins.right ?? 40))
        };
        console.log(`[READ] 여백 복원 성공:`, JSON.stringify(margins, null, 2));
      } catch (e) {
        console.warn(`[READ] ⚠️ 여백 데이터 파싱 실패, 기본값 사용:`, e);
      }
    } else {
      console.log(`[READ] 여백 데이터 없음, 기본값 사용`);
    }
    
    // 간격 복원
    let spacing = 48;
    if (spacingData && spacingData.trim() !== '') {
      spacing = Math.max(0, Math.min(200, parseInt(spacingData) || 48));
      console.log(`[READ] 간격 복원: ${spacing}`);
    } else {
      console.log(`[READ] 간격 데이터 없음, 기본값 사용: ${spacing}`);
    }
    
    const settings: SectionSettings = {
      direction,
      margins,
      spacing
    };
    
    console.log(`[READ] ========== 개별 설정 읽기 완료 ==========`);
    console.log(`[READ] 최종 읽은 설정:`, JSON.stringify(settings, null, 2));
    
    return settings;
    
  } catch (error) {
    console.error('섹션 설정 가져오기 실패:', error);
    // 완전한 기본값 반환
    const defaultSettings: SectionSettings = {
      direction: 'vertical',
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
      spacing: 48
    };
    console.log(`[DEBUG] 기본값 사용:`, defaultSettings);
    return defaultSettings;
  }
}

// 섹션 설정을 안전하게 저장하는 함수 (즉시 검증 포함)
function saveSectionSettings(section: FrameNode | SectionNode, settings: SectionSettings): boolean {
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
    const saveSuccess = (
      verifyAutosection === settingsJson &&
      verifyDirection === settings.direction &&
      verifyMargins === JSON.stringify(settings.margins) &&
      verifySpacing === settings.spacing.toString()
    );
    
    if (saveSuccess) {
      console.log(`[SAVE] ========== 설정 저장 성공 확인 ==========`);
      return true;
    } else {
      console.error(`[SAVE] ❌ 설정 저장 실패 - 검증 불일치`);
      return false;
    }
    
  } catch (error) {
    console.error('[SAVE] ❌ 섹션 설정 저장 중 오류:', error);
    return false;
  }
}

// 섹션 레이아웃을 즉시 업데이트하는 함수 (완전한 동기화 보장)
function updateSectionLayout(section: FrameNode | SectionNode, newSettings?: SectionSettings): void {
  try {
    console.log(`[LAYOUT] ========== 섹션 ${section.name} 레이아웃 업데이트 시작 ==========`);
    
    // 1단계: 설정 확보 및 즉시 저장
    let settings: SectionSettings;
    
    if (newSettings) {
      console.log(`[LAYOUT] 1단계 - 전달받은 새 설정 사용:`, JSON.stringify(newSettings, null, 2));
      settings = { ...newSettings };
      
      // 즉시 저장하여 일관성 보장
      console.log(`[LAYOUT] 전달받은 설정을 즉시 저장`);
      const saveSuccess = saveSectionSettings(section, settings);
      if (!saveSuccess) {
        console.error(`[LAYOUT] ❌ 설정 저장 실패, 작업 중단`);
        return;
      }
    } else {
      console.log(`[LAYOUT] 1단계 - pluginData에서 설정 읽기`);
      settings = getSectionSettings(section);
    }
    
    // 2단계: 설정 재검증 (pluginData에서 다시 읽어 확인)
    console.log(`[LAYOUT] 2단계 - 설정 재검증 (즉시 다시 읽기)`);
    const verifiedSettings = getSectionSettings(section);
    console.log(`[LAYOUT] 재검증된 설정:`, JSON.stringify(verifiedSettings, null, 2));
    
    // 설정 일치성 확인
    const settingsMatch = (
      verifiedSettings.direction === settings.direction &&
      JSON.stringify(verifiedSettings.margins) === JSON.stringify(settings.margins) &&
      verifiedSettings.spacing === settings.spacing
    );
    
    if (!settingsMatch) {
      console.warn(`[LAYOUT] ⚠️ 설정 불일치 감지:`);
      console.warn(`  예상:`, JSON.stringify(settings, null, 2));
      console.warn(`  실제:`, JSON.stringify(verifiedSettings, null, 2));
      console.log(`[LAYOUT] 재검증된 설정으로 계속 진행`);
    }
    
    // 최종적으로 재검증된 설정 사용
    const finalSettings = verifiedSettings;
    
    // 3단계: 자식 시각적 노드들 확인
    const visualNodes = getLayoutableChildren(section);
    console.log(`[LAYOUT] 3단계 - 자식 시각적 노드 수: ${visualNodes.length}`);
    
    if (visualNodes.length === 0) {
      console.log(`[LAYOUT] 시각적 노드가 없어 레이아웃 업데이트 건너뜀`);
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
      arrangeSectionFrames(section as SectionNode, finalSettings);
      console.log(`[LAYOUT] 프레임 정렬 완료`);
      
      // 섹션 크기 조정
      console.log(`[LAYOUT] 섹션 크기 조정 시작...`);
      resizeSectionToFitContent(section as SectionNode, finalSettings);
      console.log(`[LAYOUT] 섹션 크기 조정 완료`);
      
    } else {
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
      frameCount: visualNodes.length, 
      settings: { ...finalSettings },
      lastHash: getSectionStateHash(section, finalSettings),
      lastUpdate: Date.now()
    });
    console.log(`[LAYOUT] 7단계 - 추적 정보 업데이트 완료`);
    
    console.log(`[LAYOUT] ========== 레이아웃 업데이트 완료: ${section.name} ==========`);
    console.log(`[LAYOUT] 최종 결과 - 시각적 노드 수: ${visualNodes.length}, 크기 변경: ${sizeChanged ? '있음' : '없음'}`);
    
  } catch (error) {
    console.error('[LAYOUT] ❌ 섹션 레이아웃 업데이트 중 오류:', error);
    console.error('[LAYOUT] 오류 스택:', (error as Error)?.stack);
    
    figma.ui.postMessage({
      type: 'error',
      message: '섹션 레이아웃 업데이트 중 오류가 발생했습니다.'
    });
  }
}

// 선택된 섹션의 방향 변경 (하위 호환성을 위해 유지)
function changeSectionDirection(newSettings: SectionSettings): void {
  // 새로운 통합 함수 사용
  updateSelectedSectionSettings(newSettings);
  
  figma.ui.postMessage({ 
    type: 'success', 
    message: `섹션이 ${newSettings.direction === 'vertical' ? '세로' : '가로'} 방향으로 변경되었습니다!` 
  });
}

// 선택된 섹션의 설정 업데이트 (완전히 재작성하여 안정성 극대화)
function updateSelectedSectionSettings(newSettings: SectionSettings): void {
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
    const sections = selection.filter(node => 
      (node.type === 'SECTION' && node.name.startsWith('AutoSection_')) ||
      (node.type === 'FRAME' && node.name.startsWith('AutoSection_'))
    ) as (FrameNode | SectionNode)[];

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
    const validatedSettings: SectionSettings = {
      direction: newSettings.direction || 'vertical',
      margins: {
        top: Math.max(0, Math.min(200, newSettings.margins?.top ?? 40)),
        bottom: Math.max(0, Math.min(200, newSettings.margins?.bottom ?? 40)),
        left: Math.max(0, Math.min(200, newSettings.margins?.left ?? 40)),
        right: Math.max(0, Math.min(200, newSettings.margins?.right ?? 40))
      },
      spacing: Math.max(0, Math.min(200, newSettings.spacing ?? 48))
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
    const settingsMatch = (
      immediateSettings.direction === validatedSettings.direction &&
      JSON.stringify(immediateSettings.margins) === JSON.stringify(validatedSettings.margins) &&
      immediateSettings.spacing === validatedSettings.spacing
    );
    
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
    } catch (layoutError) {
      console.error(`[SETTING] ❌ 레이아웃 업데이트 실패:`, layoutError);
      
      // 7단계: 오류 복구 시도
      console.log(`[SETTING] 7단계 - 오류 복구 시도`);
      try {
        saveSectionSettings(section, validatedSettings);
        updateSectionLayout(section, validatedSettings);
        console.log(`[SETTING] 복구 업데이트 완료`);
      } catch (recoveryError) {
        console.error(`[SETTING] ❌ 복구도 실패:`, recoveryError);
      }
    }
    
    // 8단계: 추적 정보 즉시 업데이트
    console.log(`[SETTING] 8단계 - 추적 정보 즉시 업데이트`);
    const visualNodes = getLayoutableChildren(section);
    trackedSections.set(section.id, {
      frameCount: visualNodes.length,
      settings: { ...validatedSettings },
      lastHash: getSectionStateHash(section, validatedSettings),
      lastUpdate: Date.now()
    });
    console.log(`[SETTING] 추적 정보 업데이트 완료: ${visualNodes.length}개 시각적 노드`);
    
    // 9단계: 최종 상태 즉시 확인
    console.log(`[SETTING] 9단계 - 최종 상태 즉시 확인`);
    const finalSettings = getSectionSettings(section);
    console.log(`[SETTING] 최종 설정:`, JSON.stringify(finalSettings, null, 2));
    
    // 최종 검증 및 필요시 재적용
    const finalMatch = (
      finalSettings.direction === validatedSettings.direction &&
      JSON.stringify(finalSettings.margins) === JSON.stringify(validatedSettings.margins) &&
      finalSettings.spacing === validatedSettings.spacing
    );
    
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
    
  } catch (error) {
    console.error('[DEBUG] 섹션 설정 업데이트 중 치명적 오류:', error);
    console.error('[DEBUG] 오류 스택:', (error as Error)?.stack);
    figma.ui.postMessage({
      type: 'error',
      message: '섹션 설정 업데이트에 실패했습니다: ' + (error as Error)?.message
    });
  }
}