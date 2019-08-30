from flask import Flask, render_template
import log_t_diff as log_t
import json
import time
import threading
import os
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

seen_ = {}
devices_ = {}
logcat_run_inst_ = None

@app.errorhandler(404)
def not_found(error=None):
  message = {
      'status': 404,
      'message': 'Not Found: ' + request.url,
  }
  resp = jsonify(message)
  resp.status_code = 404
  return resp

@app.route('/get_stat')
def get_stat():
  data = request.get_json()
  print data
  return json.dumps(data)

@app.route('/devices')
def get_devices():
  return json.dumps(log_t.devices());

@app.route('/run_test')
def run_test():
  global logcat_run_inst_
  if request.method != 'POST':
    return not_found()
  if logcat_run_inst_ is not None:
    return "in progress"

  data = request.get_json()
  logcat_run_inst_ = log_t.LogcatRun(data[0])
  return 'hello world'

def read_loop():
  global seen_, devices_
  while True:
    d = log_t.DATA_DIR
    if not (os.path.exists(d) and os.path.isdir(d)):
      time.sleep(2)
      continue
    for f in os.listdir(d):
      if f in seen_: continue
      seen_[f] = True
      with open(d + "/" + f + "/result.json", "r") as fin:
        result = json.loads(fin.read())
        key = result["product"], result["sdk"]
        if key in devices_:
          devices_[key].append(result)
        else:
          devices_[key] = [result]
    time.sleep(2)

def check_logcat_loop():
  global logcat_run_inst_
  while True:
    if logcat_run_inst_ is not None:
      if logcat_run_inst_.quit_:
        logcat_run_inst_ = None
    time.sleep(1)

# start read thread
read_thread = threading.Thread(target=read_loop)
read_thread.daemon = True
read_thread.start()

check_thread = threading.Thread(target=check_logcat_loop)
check_thread.daemon = True
check_thread.start()
