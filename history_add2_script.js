/**
 * history_add2_script_optimized.js
 * Gemini 챗봇 프론트엔드 스크립트 (최적화 및 주석 버전)
 *
 * 기능:
 * - 사용자 메시지 입력 및 서버 전송
 * - 챗봇 응답 수신 및 화면 표시 (텍스트, 이미지 포함)
 * - 서버 URL 설정 및 저장
 * - 채팅 스타일(페르소나) 선택
 * - 추론 설정 (Temperature, Top P) 조절
 * - 채팅 기록 관리 (LocalStorage 사용): 목록 표시, 선택, 전체 삭제, 자동 제목 생성
 * - '여행 전문가' 스타일 선택 시 여행 정보(국가, 날짜) 입력 폼 제공
 * - 로딩 상태 표시 및 추론 시간 측정/표시
 * - 설정 사이드바 접기/펼치기
 * - ✨ 높이 조절 관련 ✨: 텍스트 입력창 높이 자동 조절 기능 추가
 */

// DOMContentLoaded 이벤트: HTML 문서가 완전히 로드되고 파싱되었을 때 실행될 함수를 등록합니다.
// 즉, HTML 요소들이 모두 준비된 후에 스크립트 코드가 실행되도록 보장합니다.
document.addEventListener('DOMContentLoaded', function () {

  // --- DOM 요소 참조 ---
  // 자주 사용될 HTML 요소들을 미리 찾아 변수에 할당해두면,
  // 필요할 때마다 매번 DOM 트리를 탐색하는 비용을 줄일 수 있습니다. (캐싱)
  // 'const' 키워드는 해당 변수가 재할당되지 않을 것임을 명확히 하여 코드 안정성을 높입니다.
  const chatArea = document.getElementById('chat-area');                   // 채팅 메시지가 표시될 영역
  const userInput = document.getElementById('user-input');                 // 사용자 메시지 입력 필드 (이제 textarea)
  const sendButton = document.getElementById('send-button');               // 메시지 전송 버튼
  const serverDomainInput = document.getElementById('server-domain');      // 서버 도메인 입력 필드
  const setUrlButton = document.getElementById('set-url');                 // 서버 URL 설정 버튼
  const fullUrlDisplay = document.getElementById('full-url');              // 완성된 서버 URL 표시 영역
  const refreshButton = document.getElementById('refresh-button');         // 페이지 새로고침 버튼
  const newChatButton = document.getElementById('new-chat-button');        // 새 채팅 시작 버튼
  const styleSelector = document.getElementById('style-selector-sidebar'); // 채팅 스타일 선택 드롭다운
  const chatHistoryList = document.getElementById('chat-history-list');    // 채팅 기록 목록 표시 영역
  const deleteHistoryButton = document.getElementById('delete-history-button'); // 채팅 기록 전체 삭제 버튼
  const temperatureSlider = document.getElementById('temperature-slider'); // Temperature 조절 슬라이더
  const temperatureValueDisplay = document.getElementById('temperature-value'); // Temperature 값 표시 영역
  const topPSlider = document.getElementById('top-p-slider');              // Top P 조절 슬라이더
  const topPValueDisplay = document.getElementById('top-p-value');         // Top P 값 표시 영역
  const sidebar = document.getElementById('settings-sidebar');             // 설정 사이드바
  const toggleSidebarButton = document.getElementById('toggle-sidebar-button'); // 사이드바 접기/펼치기 버튼
  const sidebarToggleIcon = document.getElementById('sidebar-toggle-icon');     // 사이드바 토글 아이콘
  const expandSidebarButton = document.getElementById('expand-sidebar-button'); // 접힌 사이드바 펼치기 버튼 (숨겨져 있음)

  // --- 상태 변수 ---
  // 애플리케이션의 현재 상태를 저장하는 변수들입니다.
  let serverUrl = '';                      // 서버 API의 전체 URL
  let loadingMessageDiv = null;            // 로딩 메시지 표시용 div 요소 참조 (동적으로 생성/제거됨)
  let loadingStartTime = 0;                // API 요청 시작 시간 (추론 시간 측정용)
  let loadingIntervalId = null;            // 로딩 시간 업데이트용 setInterval ID (나중에 clearInterval 하기 위함)

  // 채팅 기록 관련 상태
  // loadChatHistory() 함수를 호출하여 localStorage에서 기존 채팅 기록을 불러옵니다. 없으면 빈 배열([])로 초기화합니다.
  let chatSessions = loadChatHistory() || [];
  let currentChatSessionId = null;         // 현재 활성화된 채팅 세션의 ID

  // 추론 설정 관련 상태
  // 슬라이더의 현재 값을 숫자로 변환하여 초기값으로 설정합니다.
  let currentTemperature = parseFloat(temperatureSlider.value);
  let currentTopP = parseFloat(topPSlider.value);

  // '여행 전문가' 스타일 관련 상태
  let travelCountry = '';                  // 여행 국가
  let travelStartDate = '';                // 여행 시작 날짜
  let travelEndDate = '';                  // 여행 종료 날짜
  let travelInfoStep = -1;                 // 여행 정보 입력 단계 (-1: 미시작, 0: 국가, 1: 시작일, 2: 종료일)
  let travelInfoCollected = false;         // 서버에 여행 정보(혼잡도 관련)를 한번 보냈는지 여부

  // --- 초기화 ---

  // 로컬 스토리지에서 저장된 서버 도메인 불러오기
  const savedServerDomain = localStorage.getItem('serverDomain');
  if (savedServerDomain) {
    serverDomainInput.value = savedServerDomain; // 입력 필드에 값 채우기
    // 저장된 도메인으로 즉시 서버 URL 구성
    serverUrl = buildServerUrl(savedServerDomain);
    fullUrlDisplay.textContent = `완성된 URL: ${serverUrl}`; // 화면에 표시
    displayMessage('system', `서버 URL 자동 설정됨: ${serverUrl}`); // 시스템 메시지로 알림
  }

  // 채팅 기록 목록 렌더링
  renderChatHistoryList();

  // ✨ 높이 조절 관련 ✨: 페이지 로드 시 초기 높이 설정 (textarea에 초기 값이 있을 수 있으므로)
  adjustTextareaHeight(userInput);

  // --- 이벤트 리스너 등록 ---
  // 각 HTML 요소의 특정 이벤트(예: 'click', 'change', 'input', 'keypress')가 발생했을 때 실행될 함수들을 연결합니다.

  // ✨ 기록 내보내기/가져오기 관련 ✨
  const exportHistoryButton = document.getElementById('export-history-button');
  const importHistoryButton = document.getElementById('import-history-button');
  const importFileInput = document.getElementById('import-file-input');

  // 내보내기 버튼 클릭 시
  exportHistoryButton.addEventListener('click', exportChatHistory);

  // 가져오기 버튼 클릭 시 -> 숨겨진 파일 입력 필드 클릭 트리거
  importHistoryButton.addEventListener('click', () => {
    importFileInput.click(); // 사용자가 파일을 선택하도록 함
  });

  // 파일 입력 필드에서 파일이 선택되었을 때 (change 이벤트)
  importFileInput.addEventListener('change', importChatHistory);

  // URL 설정 버튼 클릭 시
  setUrlButton.addEventListener('click', function () {
    const serverDomain = serverDomainInput.value.trim(); // 입력값 양쪽 공백 제거
    if (!serverDomain) {
      alert('Colab에서 받은 서버 도메인 (예: a41b-35-245-30-102)을 입력하세요!');
      return; // 도메인이 없으면 함수 종료
    }
    localStorage.setItem('serverDomain', serverDomain); // 로컬 스토리지에 도메인 저장
    serverUrl = buildServerUrl(serverDomain);            // 서버 URL 업데이트
    console.log("설정된 서버 URL:", serverUrl);          // 콘솔에 로그 출력 (디버깅용)
    displayMessage('system', `서버 URL 설정됨: ${serverUrl}`); // 시스템 메시지 표시
    fullUrlDisplay.textContent = `완성된 URL: ${serverUrl}`; // 화면에 완성된 URL 표시
  });

  // 새로고침 버튼 클릭 시
  refreshButton.addEventListener('click', function () {
    location.reload(); // 브라우저 페이지를 새로고침합니다.
  });

  // 새 채팅 버튼 클릭 시
  newChatButton.addEventListener('click', function () {
    if (!serverUrl) { // 서버 URL이 설정되지 않았으면
      displayMessage('error', '먼저 서버 도메인을 설정하세요!');
      return; // 함수 종료
    }
    clearChatArea();                   // 채팅창 내용 지우기
    currentChatSessionId = generateChatId(); // 새 채팅 세션 ID 생성
    // 새 채팅 세션 정보를 chatSessions 배열 맨 앞에 추가 (unshift)
    chatSessions.unshift({ id: currentChatSessionId, title: '새로운 채팅', history: [] });
    // 채팅 기록은 최대 10개까지만 유지 (오래된 것부터 제거)
    if (chatSessions.length > 10) {
      chatSessions.pop();
    }
    saveChatHistory(chatSessions);      // 변경된 채팅 기록을 로컬 스토리지에 저장
    renderChatHistoryList();            // 채팅 기록 목록 UI 업데이트
    displayMessage('system', '새로운 채팅을 시작합니다.'); // 시스템 메시지 표시
    resetTravelInfo();                  // 여행 정보 관련 상태 초기화
    // ✨ 높이 조절 관련 ✨: 새 채팅 시 입력 필드 높이 초기화
    userInput.value = ''; // 혹시 남아있을 내용 제거
    adjustTextareaHeight(userInput);
  });

  // 채팅 스타일 변경 시
  styleSelector.addEventListener('change', function () {
    clearChatArea();      // 채팅창 내용 지우기
    resetTravelInfo();    // 여행 정보 관련 상태 초기화

    // '여행 전문가' 스타일이 선택된 경우, 여행 정보 입력 프로세스 시작
    if (this.value === 'travel_expert') {
      travelInfoStep = 0; // 첫 번째 단계(국가 입력)로 설정
      displayTravelInputForm('country'); // 국가 입력 폼 표시
    } else {
      travelInfoStep = -1; // 다른 스타일이면 여행 정보 입력 프로세스 비활성화
    }
    // ✨ 높이 조절 관련 ✨: 스타일 변경 시에도 입력 필드 초기화 (내용 지우기)
    userInput.value = '';
    adjustTextareaHeight(userInput);
  });

  // 전송 버튼 클릭 시
  sendButton.addEventListener('click', handleSendMessage);

  // 사용자 입력 필드(textarea)에서 Enter 키 입력 시 (Shift+Enter는 줄바꿈 유지)
  userInput.addEventListener('keypress', function (e) {
    // Enter 키가 눌렸고, Shift 키가 동시에 눌리지 않았을 때
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // Enter 키의 기본 동작(줄바꿈)을 막습니다.
      handleSendMessage();  // 메시지 전송 함수 호출
    }
  });

  // ✨ 높이 조절 관련 ✨: 사용자 입력 필드 내용 변경 시 높이 자동 조절
  userInput.addEventListener('input', () => {
    adjustTextareaHeight(userInput);
  });

  // Temperature 슬라이더 값 변경 시 (input 이벤트는 드래그 중에도 계속 발생)
  temperatureSlider.addEventListener('input', function () {
    currentTemperature = parseFloat(this.value); // 슬라이더 값을 숫자로 변환하여 상태 업데이트
    temperatureValueDisplay.textContent = currentTemperature.toFixed(1); // 소수점 첫째 자리까지 표시
  });

  // Top P 슬라이더 값 변경 시
  topPSlider.addEventListener('input', function () {
    currentTopP = parseFloat(this.value); // 슬라이더 값을 숫자로 변환하여 상태 업데이트
    topPValueDisplay.textContent = currentTopP.toFixed(2); // 소수점 둘째 자리까지 표시
  });

  // 설정 사이드바 토글 버튼 클릭 시
  toggleSidebarButton.addEventListener('click', toggleSidebar);

  // 접힌 사이드바 펼치기 버튼 클릭 시
  expandSidebarButton.addEventListener('click', openSidebar);

  // 채팅 기록 전체 삭제 버튼 클릭 시
  deleteHistoryButton.addEventListener('click', function () {
    // 사용자에게 정말 삭제할 것인지 확인 받습니다. (confirm 대화상자)
    if (confirm('대화 기록 전체를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      localStorage.removeItem('chatHistory'); // 로컬 스토리지에서 'chatHistory' 항목 제거
      chatSessions = [];                       // 메모리에 있는 채팅 기록도 비움
      renderChatHistoryList();                 // 채팅 목록 UI 업데이트 (빈 목록 표시)
      clearChatArea();                       // 채팅창 내용 지우기
      currentChatSessionId = null;             // 현재 세션 ID 초기화
      displayMessage('system', '대화 기록이 모두 삭제되었습니다.'); // 시스템 메시지 표시
      // ✨ 높이 조절 관련 ✨: 삭제 후 입력 필드 초기화
      userInput.value = '';
      adjustTextareaHeight(userInput);
    }
  });

  // --- 함수 정의 ---

  /**
   * ✨ 높이 조절 관련 ✨
   * 텍스트 영역의 높이를 내용에 맞게 조절합니다.
   * 최대 높이에 도달하면 스크롤을 활성화합니다.
   * @param {HTMLTextAreaElement} textarea - 높이를 조절할 textarea 요소
   */
  function adjustTextareaHeight(textarea) {
    // 임시로 높이를 초기화하여 scrollHeight가 실제 콘텐츠 높이를 반영하도록 함
    textarea.style.height = 'auto';
    // scrollHeight는 패딩을 포함한 콘텐츠의 전체 높이
    const scrollHeight = textarea.scrollHeight;
    // CSS에서 설정된 max-height 값을 가져옴 (예: "150px")
    const maxHeightStyle = window.getComputedStyle(textarea).maxHeight;
    // "px"를 제거하고 숫자로 변환, 값이 없거나 'none'이면 큰 값(Infinity)으로 처리하여 제한 없음으로 간주
    const maxHeight = maxHeightStyle && maxHeightStyle !== 'none' ? parseInt(maxHeightStyle, 10) : Infinity;

    // console.log(`scrollHeight: ${scrollHeight}, maxHeight: ${maxHeight}`); // 디버깅용 로그

    if (maxHeight && scrollHeight > maxHeight) {
      // 콘텐츠 높이가 최대 높이를 초과하면, 높이를 최대 높이로 고정하고 스크롤 활성화
      textarea.style.height = maxHeight + 'px';
      textarea.style.overflowY = 'auto'; // 또는 'scroll'
    } else {
      // 콘텐츠 높이가 최대 높이 이하이면, 높이를 콘텐츠 높이에 맞추고 스크롤 숨김
      textarea.style.height = scrollHeight + 'px';
      textarea.style.overflowY = 'hidden';
    }
  }

    /**
   * ✨ 마크다운/코드 복사 관련 ✨
   * 주어진 부모 요소 아래의 모든 코드 블록(<pre><code>)에 복사 버튼을 추가합니다.
   * @param {HTMLElement} parentElement - 코드 블록을 포함하는 부모 메시지 요소 (예: messageDiv)
   */
    function addCopyButtonsToCodeBlocks(parentElement) {
      const codeBlocks = parentElement.querySelectorAll('pre code'); // <pre> 안의 <code> 요소를 찾습니다.
      codeBlocks.forEach(codeElement => {
        const preElement = codeElement.parentNode; // <code>의 부모인 <pre> 요소를 가져옵니다.
        if (preElement.querySelector('.copy-code-button')) {
          // 이미 버튼이 있으면 중복 추가 방지
          return;
        }
  
        const button = document.createElement('button');
        button.textContent = 'Copy';
        button.className = 'copy-code-button'; // CSS 스타일링을 위한 클래스
        button.title = 'Copy code to clipboard';
  
        // 버튼 클릭 이벤트 리스너
        button.addEventListener('click', () => {
          copyCodeToClipboard(codeElement, button);
        });
  
        // 버튼을 <pre> 요소의 자식으로 추가 (스타일링 용이성을 위해)
        // preElement.parentNode.insertBefore(button, preElement); // <pre> 요소 앞에 버튼 삽입 (다른 방식)
        preElement.appendChild(button); // <pre> 요소 내부에 버튼 삽입 (absolute positioning 용이)
        preElement.style.position = 'relative'; // 버튼을 absolute로 위치시키기 위한 기준점
      });
    }
  
    /**
     * ✨ 마크다운/코드 복사 관련 ✨
     * 코드 블록의 텍스트를 클립보드에 복사하고 사용자에게 피드백을 줍니다.
     * @param {HTMLElement} codeElement - 복사할 내용이 있는 <code> 요소
     * @param {HTMLButtonElement} button - 클릭된 복사 버튼 요소
     */
    async function copyCodeToClipboard(codeElement, button) {
      const codeToCopy = codeElement.textContent || '';
      try {
        await navigator.clipboard.writeText(codeToCopy);
        // 성공 피드백
        button.textContent = 'Copied!';
        button.disabled = true; // 잠시 비활성화
        setTimeout(() => {
          button.textContent = 'Copy';
          button.disabled = false; // 다시 활성화
        }, 1500); // 1.5초 후 원래대로 복구
      } catch (err) {
        console.error('클립보드 복사 실패:', err);
        // 실패 피드백 (선택 사항)
        button.textContent = 'Failed';
        setTimeout(() => {
          button.textContent = 'Copy';
        }, 1500);
      }
    }

      /**
   * ✨ 기록 내보내기/가져오기 관련 ✨
   * 현재 채팅 기록(chatSessions)을 JSON 파일로 다운로드합니다.
   */
  function exportChatHistory() {
    if (!chatSessions || chatSessions.length === 0) {
      alert('내보낼 채팅 기록이 없습니다.');
      return;
    }

    try {
      // 현재 chatSessions 배열을 JSON 문자열로 변환 (null 값 제외, 보기 좋게 2칸 들여쓰기)
      const jsonString = JSON.stringify(chatSessions, null, 2);
      // JSON 문자열로 Blob 객체 생성
      const blob = new Blob([jsonString], { type: 'application/json' });
      // Blob 객체를 가리키는 임시 URL 생성
      const url = URL.createObjectURL(blob);

      // 다운로드를 위한 임시 링크(<a>) 요소 생성
      const a = document.createElement('a');
      a.href = url;
      // 다운로드될 파일 이름 설정 (예: gemini-chat-history_2023-10-27.json)
      const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      a.download = `gemini-chat-history_${timestamp}.json`;
      // 링크를 문서에 추가하지 않고 바로 클릭 이벤트 발생
      document.body.appendChild(a); // Firefox 호환성을 위해 추가
      a.click();

      // 잠시 후 임시 링크 및 URL 정리
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('채팅 기록 내보내기 완료.');
      }, 100);

    } catch (error) {
      console.error('채팅 기록 내보내기 중 오류 발생:', error);
      alert('채팅 기록을 내보내는 중 오류가 발생했습니다.');
    }
  }

  /**
   * ✨ 기록 내보내기/가져오기 관련 ✨
   * 사용자가 선택한 JSON 파일을 읽고 파싱하여 채팅 기록을 가져옵니다.
   * @param {Event} event - 파일 입력(input type="file")의 change 이벤트 객체
   */
  function importChatHistory(event) {
    const file = event.target.files[0]; // 선택된 파일 가져오기
    if (!file) {
      return; // 파일이 선택되지 않았으면 종료
    }

    // 파일 확장자나 타입 확인 (간단하게)
    if (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json') {
        alert('JSON 파일만 가져올 수 있습니다. (.json)');
        // 파일 입력 값 초기화 (다시 같은 파일 선택 가능하게)
        event.target.value = null;
        return;
    }

    const reader = new FileReader(); // 파일 읽기 위한 FileReader 객체 생성

    // 파일 읽기 완료 시 실행될 콜백 함수
    reader.onload = (e) => {
      try {
        const jsonString = e.target.result; // 파일 내용 (문자열)
        const importedData = JSON.parse(jsonString); // JSON 문자열을 객체로 파싱

        // 데이터 유효성 검사 (간단하게: 배열 형태인지, 기본적인 속성이 있는지)
        if (!Array.isArray(importedData) || (importedData.length > 0 && (!importedData[0].id || !importedData[0].history))) {
          throw new Error('가져온 파일의 형식이 올바르지 않습니다.');
        }

        // 사용자에게 기존 기록을 덮어쓸지 확인
        if (confirm(`총 ${importedData.length}개의 채팅 기록을 가져옵니다. 기존 기록은 삭제됩니다. 계속하시겠습니까?`)) {
          chatSessions = importedData; // 현재 메모리의 기록 업데이트
          saveChatHistory(chatSessions); // 로컬 스토리지에 저장
          renderChatHistoryList(); // 채팅 목록 UI 새로고침
          clearChatArea(); // 현재 채팅창 내용 비우기
          currentChatSessionId = null; // 현재 활성 세션 ID 초기화
          // (선택 사항) 가장 최근 채팅 불러오기
          // if (chatSessions.length > 0) {
          //   loadChatSession(chatSessions[0].id); // 가장 최신 ID (정렬 후 첫번째)
          // }
          displayMessage('system', `${importedData.length}개의 채팅 기록을 성공적으로 가져왔습니다.`);
          console.log('채팅 기록 가져오기 완료.');
        }
      } catch (error) {
        console.error('채팅 기록 가져오기 중 오류 발생:', error);
        alert(`채팅 기록을 가져오는 중 오류가 발생했습니다: ${error.message}`);
      } finally {
        // 파일 입력 값 초기화 (다시 같은 파일 선택 가능하게)
        event.target.value = null;
      }
    };

    // 파일 읽기 실패 시 실행될 콜백 함수
    reader.onerror = (e) => {
      console.error('파일 읽기 오류:', e);
      alert('파일을 읽는 중 오류가 발생했습니다.');
      // 파일 입력 값 초기화
      event.target.value = null;
    };

    // 파일 내용을 텍스트로 읽기 시작
    reader.readAsText(file);
  }

  /**
   * 서버 도메인 문자열을 받아 전체 API URL을 생성합니다.
   * @param {string} domain - 사용자가 입력한 ngrok 도메인 (예: 'a41b-35-245-30-102')
   * @returns {string} - 완성된 API URL (예: 'https://a41b-35-245-30-102.ngrok-free.app/api/chat')
   */
  function buildServerUrl(domain) {
    // 템플릿 리터럴(백틱 ` `)을 사용하여 문자열과 변수를 쉽게 조합합니다.
    return `https://${domain}.ngrok-free.app/api/chat`;
  }

  /**
   * 채팅창 내용을 모두 지웁니다.
   */
  function clearChatArea() {
    chatArea.innerHTML = '';
  }

  /**
   * 여행 관련 상태 변수들을 초기화합니다.
   */
  function resetTravelInfo() {
    travelCountry = '';
    travelStartDate = '';
    travelEndDate = '';
    travelInfoStep = -1;
    travelInfoCollected = false;
  }

  /**
   * 사용자가 입력한 메시지를 처리하고 서버에 전송 요청을 보냅니다.
   */
  function handleSendMessage() {
    const userMessage = userInput.value.trim(); // 입력값 양쪽 공백 제거
    if (!userMessage) return; // 메시지가 비어있으면 아무것도 안 함

    if (!serverUrl) { // 서버 URL이 설정되지 않았으면 경고 메시지 표시
      displayMessage('error', '먼저 서버 도메인을 설정하세요!');
      return;
    }

    // 현재 선택된 채팅 스타일 가져오기
    const selectedStyle = styleSelector.value;

    // 사용자 메시지를 채팅창에 표시
    displayMessage('user', userMessage);
    // 현재 채팅 세션에 사용자 메시지 추가
    addMessageToSession(currentChatSessionId, 'user', userMessage);

    // 사용자 입력 필드 비우기
    userInput.value = '';
    // ✨ 높이 조절 관련 ✨: 메시지 전송 후 높이 초기화
    adjustTextareaHeight(userInput);

    // '여행 전문가' 스타일 관련 로직
    if (selectedStyle === 'travel_expert') {
      if (travelInfoStep >= 0) {
        // 여행 정보 입력 단계 중에는 실제 서버 요청을 보내지 않고,
        // 폼 입력 처리는 각 폼의 버튼 클릭 핸들러에서 담당합니다.
        // 여기서 return 하여 서버 요청을 막습니다.
        return;
      } else {
        // 여행 정보 입력이 완료된 상태 (travelInfoStep === -1)
        // 서버에 채팅 요청 보내기 (여행 정보 포함)
        sendChatRequestToServer(userMessage, selectedStyle, travelCountry, travelStartDate, travelEndDate, currentTemperature, currentTopP);
      }
    } else {
      // 다른 스타일일 경우, 바로 서버에 채팅 요청 보내기 (여행 정보 없음)
      sendChatRequestToServer(userMessage, selectedStyle, null, null, null, currentTemperature, currentTopP);
    }
  }

  /**
   * 지정된 발신자와 메시지 내용으로 채팅 메시지 div를 생성하고 채팅창에 추가합니다.
   * @param {'user' | 'bot' | 'system' | 'error'} sender - 메시지 발신자 타입
   * @param {string} message - 메시지 텍스트 내용 (HTML 포함 가능)
   * @param {string} [imageBase64] - (선택) Base64 인코딩된 이미지 데이터 문자열
   */
  function displayMessage(sender, message, imageBase64) {
    const messageDiv = document.createElement('div');

    switch (sender) {
      case 'user':
        messageDiv.className = 'user-message';
        messageDiv.textContent = message;
        break;
      case 'bot':
        messageDiv.className = 'bot-message';

        // ✨ 마크다운/코드 복사 관련 ✨: marked.js를 사용하여 메시지 파싱
        // 주의: message는 HTML이 아닌 순수 텍스트 또는 마크다운이어야 합니다.
        // 서버 응답 (data.response) 또는 history (message.text)가 마크다운 형식이라고 가정합니다.
        let botHtmlContent = '';
        let inferenceTimeHtml = ''; // 추론 시간은 마크다운 파싱 후 별도 추가

        // message가 객체 형태일 수 있음 (추론 시간 포함된 경우) - 이전 로직 호환성 고려
        if (typeof message === 'string') {
             // 히스토리 로드 등 순수 메시지 텍스트인 경우
             try {
                 botHtmlContent = marked.parse(message);
             } catch (e) {
                 console.error("Markdown 파싱 오류:", e);
                 botHtmlContent = message; // 파싱 실패 시 원본 텍스트 표시
             }
        } else if (message && typeof message.text === 'string') {
             // addMessageToSession 등에서 온 객체 형태 (추후 확장 대비)
             try {
                 botHtmlContent = marked.parse(message.text);
             } catch (e) {
                 console.error("Markdown 파싱 오류:", e);
                 botHtmlContent = message.text;
             }
             if(message.inferenceTime) {
                inferenceTimeHtml = ` <span class="inference-time">(${message.inferenceTime.toFixed(2)}초)</span>`;
             }
        } else {
            // 예상치 못한 형식일 경우, 일단 문자열로 변환 시도
            try {
                 botHtmlContent = marked.parse(String(message));
            } catch (e) {
                 console.error("Markdown 파싱 오류:", e);
                 botHtmlContent = String(message);
            }
        }

        // 추론 시간 처리 (sendChatRequestToServer 에서 오는 경우)
        // message 파라미터가 추론 시간을 포함한 HTML 문자열일 수 있음
        // 이 경우, 추론 시간 부분을 분리하고 메시지만 파싱
        const timeMatch = message.match(/ <span class="inference-time">\(.*?초\)<\/span>$/);
        if (timeMatch) {
            inferenceTimeHtml = timeMatch[0];
            const messageOnly = message.substring(0, message.length - timeMatch[0].length);
             try {
                 botHtmlContent = marked.parse(messageOnly);
             } catch (e) {
                 console.error("Markdown 파싱 오류:", e);
                 botHtmlContent = messageOnly;
             }
        }


        messageDiv.innerHTML = botHtmlContent; // 파싱된 HTML을 div에 삽입

        // 추론 시간이 있으면 뒤에 추가
        if (inferenceTimeHtml) {
            // 주의: innerHTML을 다시 설정하면 이벤트 리스너 등이 날아갈 수 있으므로
            //      별도의 span 등을 만들어서 appendChild 하는 것이 더 안전할 수 있으나,
            //      여기서는 간단하게 문자열로 추가합니다.
            //      또는, 추론 시간을 위한 placeholder를 HTML에 두고 내용을 채우는 방식도 가능.
             messageDiv.innerHTML += inferenceTimeHtml;
        }


        // 이미지 데이터가 있으면 이미지 요소 추가
        if (imageBase64) {
          const imageElement = document.createElement('img');
          imageElement.src = `data:image/png;base64,${imageBase64}`;
          imageElement.style.maxWidth = '100%';
          imageElement.style.marginTop = '0.5rem';
          messageDiv.appendChild(imageElement); // 이미지 추가
        }

        // ✨ 마크다운/코드 복사 관련 ✨: 메시지 div에 복사 버튼 추가 함수 호출
        addCopyButtonsToCodeBlocks(messageDiv);

        break;
      case 'system':
        messageDiv.className = 'system-message';
        messageDiv.textContent = `시스템: ${message}`;
        break;
      case 'error':
        messageDiv.className = 'error-message';
        messageDiv.textContent = `오류: ${message}`;
        break;
    }

    chatArea.appendChild(messageDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  /**
   * "생각 중..." 로딩 메시지를 표시하고, 추론 시간 측정을 시작합니다.
   */
  function displayLoadingMessage() {
    // 혹시 이전에 표시된 로딩 메시지가 있다면 제거 (중복 방지)
    hideLoadingMessage();

    loadingMessageDiv = document.createElement('div');
    loadingMessageDiv.className = 'loading-message'; // CSS 클래스 적용
    loadingMessageDiv.textContent = 'Gemini is thinking'; // 기본 텍스트

    // 시간 표시용 span 요소 생성 및 추가
    const inferenceTimeSpan = document.createElement('span');
    inferenceTimeSpan.className = 'inference-time'; // CSS 클래스 적용
    inferenceTimeSpan.textContent = ' (⏳ 0.00초)'; // 초기 시간 표시
    loadingMessageDiv.appendChild(inferenceTimeSpan);

    // 로딩 애니메이션용 점(...) 추가
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('span');
      dot.className = 'loading-message-dot'; // CSS 클래스 적용 (애니메이션)
      dot.textContent = '.';
      loadingMessageDiv.appendChild(dot);
    }

    chatArea.appendChild(loadingMessageDiv); // 채팅 영역에 로딩 메시지 추가
    chatArea.scrollTop = chatArea.scrollHeight; // 스크롤 맨 아래로

    // 로딩 시작 시간 기록 (고정밀도 타이머 사용)
    loadingStartTime = performance.now();
    // 0.1초(100ms)마다 updateLoadingTime 함수를 호출하여 시간 업데이트 (setInterval)
    loadingIntervalId = setInterval(updateLoadingTime, 100);
  }

  /**
   * 로딩 메시지에 표시되는 경과 시간을 업데이트합니다. (setInterval 콜백 함수)
   */
  function updateLoadingTime() {
    // 로딩 메시지 요소가 존재하지 않으면(예: 이미 응답을 받아 제거된 경우) 함수 종료
    if (!loadingMessageDiv) {
      // 만약 interval이 여전히 실행 중이라면 여기서 확실히 제거
      if (loadingIntervalId) {
        clearInterval(loadingIntervalId);
        loadingIntervalId = null;
      }
      return;
    }
    // 현재 시간과 시작 시간의 차이를 계산하여 초 단위로 변환
    const elapsedTime = (performance.now() - loadingStartTime) / 1000;
    // 로딩 메시지 div 안에서 시간 표시용 span 요소를 찾습니다.
    const inferenceTimeSpan = loadingMessageDiv.querySelector('.inference-time');
    if (inferenceTimeSpan) {
      // 찾은 span 요소의 텍스트 내용을 경과 시간으로 업데이트 (소수점 둘째 자리까지)
      inferenceTimeSpan.textContent = ` (⏳ ${elapsedTime.toFixed(2)}초)`;
    }
  }

  /**
   * 로딩 메시지를 숨기고, 추론 시간 업데이트 타이머를 정지합니다.
   */
  function hideLoadingMessage() {
    // setInterval 타이머가 실행 중이면 정지시킵니다.
    if (loadingIntervalId) {
      clearInterval(loadingIntervalId);
      loadingIntervalId = null; // ID 초기화
    }
    // 로딩 메시지 div 요소가 존재하고, chatArea의 자식이 맞는지 확인 후 제거
    if (loadingMessageDiv && loadingMessageDiv.parentNode === chatArea) {
      chatArea.removeChild(loadingMessageDiv);
    }
    loadingMessageDiv = null; // 참조 제거
  }

  // --- 사이드바 관련 함수 ---
  let isSidebarCollapsed = false; // 사이드바 접힘 상태

  /**
   * 설정 사이드바를 접거나 펼칩니다.
   */
  function toggleSidebar() {
    isSidebarCollapsed = !isSidebarCollapsed; // 상태 반전
    sidebar.classList.toggle('collapsed');     // 'collapsed' CSS 클래스 추가/제거
    expandSidebarButton.classList.toggle('visible', isSidebarCollapsed); // 접혔을 때만 펼치기 버튼 보이게

    // 아이콘 모양 변경 (오른쪽/왼쪽 화살표)
    if (isSidebarCollapsed) {
      sidebarToggleIcon.classList.replace('fa-chevron-right', 'fa-chevron-left');
      toggleSidebarButton.title = "사이드바 펼치기"; // 버튼 툴팁 변경
    } else {
      sidebarToggleIcon.classList.replace('fa-chevron-left', 'fa-chevron-right');
      toggleSidebarButton.title = "사이드바 접기"; // 버튼 툴팁 변경
    }
  }

  /**
   * 접혀있는 설정 사이드바를 펼칩니다.
   */
  function openSidebar() {
    isSidebarCollapsed = false; // 상태 업데이트
    sidebar.classList.remove('collapsed'); // 'collapsed' 클래스 제거
    sidebarToggleIcon.classList.replace('fa-chevron-left', 'fa-chevron-right'); // 아이콘 변경
    expandSidebarButton.classList.remove('visible'); // 펼치기 버튼 숨기기
    toggleSidebarButton.title = "사이드바 접기"; // 버튼 툴팁 변경
  }


  // --- 여행 정보 입력 폼 관련 함수 ---

  /**
   * '여행 전문가' 스타일 선택 시, 단계별로 정보 입력을 위한 폼을 표시합니다.
   * @param {'country' | 'startDate' | 'endDate'} step - 표시할 입력 폼의 단계
   */
  function displayTravelInputForm(step) {
    clearChatArea(); // 기존 채팅 내용 지우기

    const formContainer = document.createElement('div');
    formContainer.className = 'travel-input-box'; // 폼 컨테이너 스타일

    const label = document.createElement('label');
    const input = document.createElement('input');
    const submitButton = document.createElement('button');
    submitButton.textContent = '확인'; // 기본 버튼 텍스트

    switch (step) {
      case 'country':
        label.textContent = '어느 나라로 여행을 가시나요?';
        input.type = 'text';
        input.id = 'travel-country-input'; // ID 부여 (필요시 사용)
        input.placeholder = '예: 일본';
        // 버튼 클릭 시 국가 정보 저장 및 다음 단계로 이동
        submitButton.onclick = () => {
          travelCountry = input.value.trim();
          if (travelCountry) {
            travelInfoStep = 1; // 다음 단계(시작일)로
            displayTravelInputForm('startDate');
          } else {
            alert('나라 이름을 입력해주세요.');
          }
        };
        break;

      case 'startDate':
        label.textContent = '여행 시작 날짜를 알려주세요 (YYYY-MM-DD 형식):';
        input.type = 'date'; // 날짜 입력 타입
        input.id = 'travel-start-date-input';
        // 버튼 클릭 시 시작 날짜 저장 및 다음 단계로 이동
        submitButton.onclick = () => {
          travelStartDate = input.value;
          if (travelStartDate) {
            travelInfoStep = 2; // 다음 단계(종료일)로
            displayTravelInputForm('endDate');
          } else {
            alert('시작 날짜를 선택해주세요.');
          }
        };
        break;

      case 'endDate':
        label.textContent = '여행 종료 날짜를 알려주세요 (YYYY-MM-DD 형식):';
        input.type = 'date';
        input.id = 'travel-end-date-input';
        input.min = travelStartDate; // 시작 날짜 이전은 선택 불가하도록 설정
        submitButton.textContent = '여행 계획 조회 시작'; // 마지막 단계 버튼 텍스트
        // 버튼 클릭 시 종료 날짜 저장 및 정보 입력 완료 처리
        submitButton.onclick = () => {
          travelEndDate = input.value;
          if (travelEndDate) {
            if (new Date(travelEndDate) < new Date(travelStartDate)) {
              alert('종료 날짜는 시작 날짜보다 빠를 수 없습니다.');
              return;
            }
            travelInfoStep = -1; // 정보 입력 프로세스 완료
            travelInfoCollected = false; // 아직 서버에 혼잡도 정보 요청 전 상태로 초기화
            clearChatArea(); // 폼 제거
            // 사용자에게 다음 행동 안내 메시지 표시
            displayMessage('bot', `여행 정보를 입력해주셔서 감사합니다! '${travelCountry}' (${travelStartDate} ~ ${travelEndDate}) 관련 질문을 해주세요.`);
          } else {
            alert('종료 날짜를 선택해주세요.');
          }
        };
        break;
    }

    // 생성된 label, input, button을 formContainer에 추가
    formContainer.appendChild(label);
    formContainer.appendChild(input);
    formContainer.appendChild(submitButton);
    // 완성된 폼 컨테이너를 채팅 영역에 추가
    chatArea.appendChild(formContainer);
    // input 요소에 자동으로 포커스 설정 (사용자 편의성)
    input.focus();
    chatArea.scrollTop = chatArea.scrollHeight; // 스크롤 맨 아래로
  }


  // --- 서버 통신 ---

  /**
   * 사용자 메시지와 설정값을 서버 API로 전송하고 응답을 처리합니다.
   * Detects response type (JSON or SSE) and handles accordingly.
   * @param {string} userMessage - 사용자가 입력한 메시지
   * @param {string} style - 선택된 채팅 스타일 (페르소나)
   * @param {string|null} country - 여행 국가 (여행 전문가 스타일인 경우)
   * @param {string|null} startDate - 여행 시작 날짜 (여행 전문가 스타일인 경우)
   * @param {string|null} endDate - 여행 종료 날짜 (여행 전문가 스타일인 경우)
   * @param {number} temperature - Temperature 설정값
   * @param {number} top_p - Top P 설정값
   */
  async function sendChatRequestToServer(userMessage, style, country, startDate, endDate, temperature, top_p) {
    displayLoadingMessage();
  
    const requestData = { user_message: userMessage, style: style, temperature: temperature, top_p: top_p };
    if (style === 'travel_expert' && country && startDate && endDate && !travelInfoCollected) {
      requestData.travel_country = country;
      requestData.travel_start_date = startDate;
      requestData.travel_end_date = endDate;
    }
  
    try {
      const response = await fetch(serverUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream, application/json'
        },
        body: JSON.stringify(requestData)
      });
  
      const contentType = response.headers.get('Content-Type');
      console.log('응답 Content-Type:', contentType); // 디버깅 로그 추가
  
      if (!response.ok) {
        hideLoadingMessage();
        const errorText = await response.text();
        throw new Error(`서버 응답 오류: ${response.status} ${response.statusText}. ${errorText}`);
      }
  
      if (contentType && contentType.includes('text/event-stream')) {
        // SSE 처리
        console.log("SSE 스트림 처리 시작...");
        hideLoadingMessage();
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullBotResponse = '';
        let botMessageDiv = null;
  
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
  
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';
  
          for (const line of lines) {
            if (line.startsWith('data:')) {
              const jsonData = line.substring(5).trim();
              try {
                const eventData = JSON.parse(jsonData);
                if (eventData.type === 'chunk') {
                  fullBotResponse += eventData.content;
                  if (!botMessageDiv) {
                    botMessageDiv = document.createElement('div');
                    botMessageDiv.className = 'bot-message';
                    chatArea.appendChild(botMessageDiv);
                  }
                  botMessageDiv.innerHTML = marked.parse(fullBotResponse);
                  addCopyButtonsToCodeBlocks(botMessageDiv);
                  chatArea.scrollTop = chatArea.scrollHeight;
                } else if (eventData.type === 'final') {
                  const finalInferenceTime = (performance.now() - loadingStartTime) / 1000;
                  if (botMessageDiv) {
                    botMessageDiv.innerHTML += ` <span class="inference-time">(${finalInferenceTime.toFixed(2)}초)</span>`;
                  }
                  addMessageToSession(currentChatSessionId, 'bot', fullBotResponse);
                  if (eventData.chat_title) updateChatTitle(currentChatSessionId, eventData.chat_title);
                  if (style === 'travel_expert' && !travelInfoCollected && fullBotResponse.includes('혼잡도')) {
                    travelInfoCollected = true;
                  }
                } else if (eventData.type === 'error') {
                  displayMessage('error', `서버 스트리밍 오류: ${eventData.message}`);
                  addMessageToSession(currentChatSessionId, 'error', `서버 스트리밍 오류: ${eventData.message}`);
                }
              } catch (e) {
                console.error('SSE 데이터 파싱 오류:', e, '데이터:', jsonData);
              }
            }
          }
        }
      } else if (contentType && contentType.includes('application/json')) {
        // JSON 처리
        hideLoadingMessage();
        const data = await response.json();
        const elapsedTime = (performance.now() - loadingStartTime) / 1000;
        if (data.response) {
          const botMessageContent = `${data.response} <span class="inference-time">(${elapsedTime.toFixed(2)}초)</span>`;
          displayMessage('bot', botMessageContent, data.image_base64);
          addMessageToSession(currentChatSessionId, 'bot', data.response, data.image_base64);
          if (data.chat_title) updateChatTitle(currentChatSessionId, data.chat_title);
          if (style === 'travel_expert' && requestData.travel_country && !travelInfoCollected) {
            travelInfoCollected = true;
          }
        } else if (data.error) {
          displayMessage('error', `서버 오류: ${data.error}`);
          addMessageToSession(currentChatSessionId, 'error', `서버 오류: ${data.error}`);
        }
      } else {
        // 예상치 못한 Content-Type 처리
        hideLoadingMessage();
        const text = await response.text();
        throw new Error(`알 수 없는 응답 형식: ${contentType}. 본문: ${text.substring(0, 100)}`);
      }
    } catch (error) {
      hideLoadingMessage();
      displayMessage('error', `네트워크 오류: ${error.message}`);
      addMessageToSession(currentChatSessionId, 'error', `네트워크 오류: ${error.message}`);
    }
  }


  // --- 채팅 기록 관리 함수 ---

  /**
   * 고유한 채팅 세션 ID를 생성합니다. (현재 시간을 문자열로 사용)
   * @returns {string} - 생성된 채팅 ID
   */
  function generateChatId() {
    return Date.now().toString();
  }

  /**
   * 로컬 스토리지에서 채팅 기록을 불러옵니다.
   * @returns {Array|null} - 저장된 채팅 기록 배열 또는 없으면 null
   */
  function loadChatHistory() {
    const historyString = localStorage.getItem('chatHistory');
    try {
      // JSON 문자열을 파싱하여 JavaScript 객체(배열)로 변환
      return historyString ? JSON.parse(historyString) : null;
    } catch (e) {
      // 파싱 중 오류 발생 시 (예: 저장된 데이터가 깨진 경우)
      console.error("채팅 기록 로딩 오류:", e);
      localStorage.removeItem('chatHistory'); // 문제가 있는 데이터 제거
      return null;
    }
  }

  /**
   * 채팅 기록 배열을 로컬 스토리지에 저장합니다.
   * @param {Array} history - 저장할 채팅 기록 배열
   */
  function saveChatHistory(history) {
    try {
      // JavaScript 배열을 JSON 문자열로 변환하여 저장
      localStorage.setItem('chatHistory', JSON.stringify(history));
    } catch (e) {
      console.error("채팅 기록 저장 오류:", e);
      // 저장 공간 부족 등의 예외 처리 필요 시 여기에 추가
    }
  }

  /**
   * `chatSessions` 배열을 기반으로 채팅 기록 목록 UI를 생성하여 표시합니다.
   */
  function renderChatHistoryList() {
    chatHistoryList.innerHTML = ''; // 기존 목록 비우기

    // 기록된 세션들을 ID(시간순) 내림차순으로 정렬 (최신 채팅이 위로)
    // chatSessions가 null이나 undefined가 아닌지 확인 후 정렬
    if (chatSessions && chatSessions.length > 0) {
      chatSessions.sort((a, b) => parseInt(b.id) - parseInt(a.id));

      // 각 채팅 세션에 대해 버튼 생성
      chatSessions.forEach(session => {
        const chatButton = document.createElement('button');
        // 버튼 텍스트 설정 (제목 없으면 '제목 없음' 표시)
        chatButton.textContent = session.title || '제목 없음';
        // 버튼에 마우스 올렸을 때 전체 제목 표시 (툴팁)
        chatButton.title = session.title || '제목 없음';
        // 버튼 클릭 시 해당 채팅 세션 로드하는 이벤트 리스너 추가
        chatButton.addEventListener('click', () => loadChatSession(session.id));
        chatHistoryList.appendChild(chatButton); // 목록 영역에 버튼 추가
      });
    }
  }

   /**
   * 지정된 채팅 세션의 제목을 업데이트하고, 변경사항을 저장 및 UI에 반영합니다.
   * @param {string} sessionId - 제목을 업데이트할 채팅 세션 ID
   * @param {string} newTitle - 새로운 제목
   */
  function updateChatTitle(sessionId, newTitle) {
    // chatSessions 배열에서 해당 sessionId를 가진 세션의 인덱스 찾기
    const sessionIndex = chatSessions.findIndex(s => s.id === sessionId);
    if (sessionIndex !== -1) { // 세션을 찾았다면
      // 세션 제목이 아직 없거나 ('새로운 채팅' 포함), 서버에서 받은 새 제목과 다를 경우에만 업데이트
      if (!chatSessions[sessionIndex].title || chatSessions[sessionIndex].title === '새로운 채팅' || chatSessions[sessionIndex].title !== newTitle) {
          chatSessions[sessionIndex].title = newTitle; // 제목 업데이트
          saveChatHistory(chatSessions);         // 변경사항 저장
          renderChatHistoryList();               // 목록 UI 새로고침
          console.log(`채팅 [${sessionId}] 제목 업데이트: ${newTitle}`);
      }
    } else {
      console.warn('제목을 업데이트할 채팅 세션을 찾을 수 없습니다:', sessionId);
    }
  }

  /**
   * 지정된 ID의 채팅 세션 내용을 채팅창에 불러옵니다.
   * @param {string} sessionId - 불러올 채팅 세션 ID
   */
  function loadChatSession(sessionId) {
    // chatSessions 배열에서 해당 sessionId를 가진 세션 찾기
    const session = chatSessions.find(s => s.id === sessionId);
    if (session) {
      clearChatArea(); // 현재 채팅창 내용 비우기
      currentChatSessionId = sessionId; // 현재 활성 세션 ID 업데이트

      // 해당 세션의 모든 메시지를 순서대로 채팅창에 표시
      session.history.forEach(message => {
        displayMessage(message.sender, message.text, message.imageBase64);
      });

      // (개선) 선택된 세션을 목록 맨 위로 이동시키는 로직 (선택사항)
      const selectedIndex = chatSessions.findIndex(s => s.id === sessionId);
      if (selectedIndex > 0) { // 맨 위에 있는 세션이 아니면
        const [selectedSession] = chatSessions.splice(selectedIndex, 1); // 배열에서 제거하고
        chatSessions.unshift(selectedSession); // 배열 맨 앞에 추가
        saveChatHistory(chatSessions);    // 변경된 순서 저장
        renderChatHistoryList();          // 목록 UI 업데이트
      }

      // 해당 세션의 페르소나/설정 복원 (세션 객체에 저장된 경우)
      if (session.settings) {
          styleSelector.value = session.settings.style || 'default';
          temperatureSlider.value = session.settings.temperature || 0.7;
          topPSlider.value = session.settings.top_p || 0.95;
          // 슬라이더 값 표시 업데이트
          temperatureValueDisplay.textContent = parseFloat(temperatureSlider.value).toFixed(1);
          topPValueDisplay.textContent = parseFloat(topPSlider.value).toFixed(2);
          // 상태 변수도 업데이트
          currentTemperature = parseFloat(temperatureSlider.value);
          currentTopP = parseFloat(topPSlider.value);
      } else {
          // 세션에 설정 정보가 없다면 기본값으로 되돌릴 수 있습니다.
          // styleSelector.value = 'default';
          // ...
      }

      // 만약 '여행 전문가' 세션이었다면, 관련 정보 복원
      if (session.style === 'travel_expert' && session.travelInfo) {
         travelCountry = session.travelInfo.country;
         travelStartDate = session.travelInfo.startDate;
         travelEndDate = session.travelInfo.endDate;
         travelInfoCollected = true; // 이미 정보를 입력했던 세션이므로 true
         travelInfoStep = -1; // 로드 시에는 입력 단계가 아님
         styleSelector.value = 'travel_expert'; // 스타일 셀렉터 맞춰주기 (settings 복원에서 이미 처리될 수도 있음)
         displayMessage('system', `여행 전문가 채팅(${travelCountry}, ${travelStartDate}~${travelEndDate})을 이어갑니다.`);
      } else {
         resetTravelInfo(); // 다른 세션이면 여행 정보 초기화
         // 필요하다면 styleSelector 값도 해당 세션에 맞게 설정 (settings 복원 참고)
      }

      // ✨ 높이 조절 관련 ✨: 세션 로드 후 입력 필드 초기화 (혹시 모를 잔여 데이터 제거)
      userInput.value = '';
      adjustTextareaHeight(userInput);

      console.log(`채팅 [${sessionId}] 로드 완료.`);
    } else {
      console.error('로드할 채팅 세션을 찾을 수 없습니다:', sessionId);
      displayMessage('error', '선택한 채팅 기록을 불러오는 데 실패했습니다.');
    }
  }

  /**
   * 현재 활성화된 채팅 세션에 메시지를 추가합니다. 세션이 없으면 새로 생성합니다.
   * @param {string | null} sessionId - 메시지를 추가할 세션 ID (null이면 새 세션 생성)
   * @param {'user' | 'bot' | 'system' | 'error'} sender - 메시지 발신자
   * @param {string} message - 메시지 내용
   * @param {string} [imageBase64] - (선택) 이미지 데이터
   */
  function addMessageToSession(sessionId, sender, message, imageBase64) {
    let sessionIndex = -1;
    if (sessionId) {
        sessionIndex = chatSessions.findIndex(s => s.id === sessionId);
    }

    const messageData = { sender: sender, text: message };
    if (imageBase64) {
        messageData.imageBase64 = imageBase64; // 이미지가 있으면 객체에 추가
    }

    if (sessionIndex !== -1) { // 기존 세션에 추가
      chatSessions[sessionIndex].history.push(messageData);
      // (선택 사항) 세션 설정 정보도 업데이트
      chatSessions[sessionIndex].settings = {
          style: styleSelector.value,
          temperature: currentTemperature,
          top_p: currentTopP
      };
      if (styleSelector.value === 'travel_expert' && travelCountry) {
          chatSessions[sessionIndex].style = 'travel_expert'; // 스타일 명시
          chatSessions[sessionIndex].travelInfo = { country: travelCountry, startDate: travelStartDate, endDate: travelEndDate };
      }

    } else { // 새 세션 생성 또는 sessionId가 null인 경우
      // sessionId가 null이었거나, 찾지 못했다면 새 ID 생성
      if (!sessionId) {
        currentChatSessionId = generateChatId();
        sessionId = currentChatSessionId;
      }
      // 새 세션 객체 생성
      const newSession = {
        id: sessionId,
        title: '새로운 채팅', // 기본 제목
        history: [messageData], // 첫 메시지 추가
        settings: { // 현재 설정 저장
            style: styleSelector.value,
            temperature: currentTemperature,
            top_p: currentTopP
        }
      };
      // 여행 정보 저장 (선택사항)
      if (styleSelector.value === 'travel_expert' && travelCountry) {
          newSession.style = 'travel_expert';
          newSession.travelInfo = { country: travelCountry, startDate: travelStartDate, endDate: travelEndDate };
      }

      chatSessions.unshift(newSession); // 배열 맨 앞에 추가

      // 최대 갯수 제한
      if (chatSessions.length > 10) {
        chatSessions.pop();
      }
      renderChatHistoryList(); // 새 세션이 추가되었으므로 목록 업데이트
    }
    // 변경된 chatSessions 배열을 로컬 스토리지에 저장
    saveChatHistory(chatSessions);
  }

}); // End of DOMContentLoaded