const ROOT = window.API_ROOT || 'http://localhost:1236/';
const apiCalls = {
  "post": (url, data) => new Promise((ok, fail) => {
    var req = new XMLHttpRequest();
    req.onload = (e) => {
      if (e) {
        fail(e);
      } else {
        ok(req.response);
      }
    };
    req.onerror =fail;
    req.open("POST", ROOT + url);
    req.send(data);
  }),
  "get": (url) => new Promise((ok, fail) => {
    var req = new XMLHttpRequest();
    req.onload = (e) => {
      ok(req.response);
    };
    req.onerror =fail;
    req.open("GET", ROOT + url);
    req.send();
  })
};
export default apiCalls;
