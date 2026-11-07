'use strict';
const before = document.querySelector('#before');
const after = document.querySelector('#after');
const result = document.querySelector('#result');
const lines = value => [...new Set(value.split(/\r?\n/).map(line => line.trim()).filter(Boolean))].sort();
document.querySelector('#compare-form').addEventListener('submit', event => {
  event.preventDefault();
  const oldValues = lines(before.value), newValues = lines(after.value);
  if (!oldValues.length || !newValues.length) {
    result.textContent = 'Enter at least one value in each box. Empty output may mean a missing answer or a failed lookup; inspect the DNS response status before comparing.';
    return;
  }
  const removed = oldValues.filter(value => !newValues.includes(value));
  const added = newValues.filter(value => !oldValues.includes(value));
  result.textContent = added.length || removed.length
    ? `${removed.length} removed · ${added.length} added\n\n${removed.map(value => '− ' + value).concat(added.map(value => '+ ' + value)).join('\n')}\n\nReview the change before updating the accepted baseline.`
    : 'No value changes. The two sets match after trimming whitespace, removing duplicate lines and ignoring line order.';
});
document.querySelector('#reorder').addEventListener('click', () => {
  before.value = '192.0.2.10\n192.0.2.11';
  after.value = '192.0.2.11\n192.0.2.10';
  document.querySelector('#compare-form').requestSubmit();
});
document.querySelector('#compare-form').addEventListener('reset', () => {
  result.textContent = 'Compare the sample values to see additions and removals.';
});
