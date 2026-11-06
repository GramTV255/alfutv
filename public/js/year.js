document.addEventListener('DOMContentLoaded', function () {
  var y = document.getElementById('yr');
  if (y) y.textContent = new Date().getFullYear();
});
