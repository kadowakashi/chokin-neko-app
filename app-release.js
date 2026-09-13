(function (root) {
  'use strict';
  const revision = 'r15';
  root.ChokinRelease = Object.freeze({
    revision,
    shellCache: `chokin-v100-shell-${revision}`
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
