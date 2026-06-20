/* =============================================================================
   PLM Dashboard — public user overrides
   -----------------------------------------------------------------------------
   Public operational metadata only. Do not put API keys, tokens, passwords, or
   private contact data in this file.

   Keys are matched against OP principal id, login, raw principal name, and mapped
   display name. capacityPerWeek is used by Resource/Risk load calculations.
   ========================================================================== */
(function () {
  'use strict';

  window.PLM_USER_OVERRIDES = {
    defaultCapacityPerWeek: 40,
    byPrincipal: {
      'drake.lee': { capacityPerWeek: 32 },
      mskim: { capacityPerWeek: 32 },
      'David.kang': { capacityPerWeek: 32 },
      'Jimmy Jeon': { capacityPerWeek: 32 },
    },
  };
})();
