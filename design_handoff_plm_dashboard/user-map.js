/* =============================================================================
   user-map.js — OP 사용자 이름 정제 매핑 테이블
   -----------------------------------------------------------------------------
   OP /principals 가 반환하는 계정명·영문명을 대시보드 표시 이름으로 변환합니다.
   OP 관리자 페이지 또는 /api/v3/principals 로 사용자 ID를 확인한 뒤 아래
   테이블에 추가하세요.

   형식 A — 이름만:
     [OP user id]: '표시 이름',

   형식 B — 전체 오버라이드:
     [OP user id]: { name: '표시 이름', title: '직함', role: '역할코드', capacityPerWeek: 40 },

   OP user ID 확인 방법:
     curl -H "Authorization: Basic <token>" https://<your-op>/api/v3/principals
   ========================================================================== */
(function () {
  'use strict';

  window.USER_MAP = {
    // 예시 (실제 OP user ID로 교체하세요):
    // 1: { name: '김도현', title: 'Project Lead', role: 'PM', capacityPerWeek: 25 },
    // 2: '이서연',
  };
})();
