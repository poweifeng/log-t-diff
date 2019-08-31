from flask import Flask, render_template, request
import log_t_diff as log_t
from log_t_diff import adb
import json
import time
import threading
import os
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

parsed_dirs_ = {}
run_records_ = {}
devices_ = []
logcat_run_inst_ = None
device_id_ = {}
inv_device_id_ = {}

@app.errorhandler(404)
def not_found(error=None):
  message = {
      'status': 404,
      'message': 'Not Found: ' + request.url,
  }
  resp = json.loads(message)
  resp.status_code = 404
  return resp

@app.route('/get_records/<dev_id>')
def get_records(dev_id):
  if dev_id in run_records_:
    return json.dumps(run_records_[dev_id])
  return json.dumps([])

def create_id(product, sdk, serial):
  return product + "+" + sdk + "+" + serial

def find_device(dev):
  global device_id_, inv_device_id_
  if dev in device_id_:
    return device_id_[dev]
  device_id = create_id(
    adb('shell getprop ro.product.name', dev),
    adb('shell getprop ro.build.version.sdk', dev),
    adb('shell getprop ro.serialno', dev))
  inv_device_id_[device_id] = dev
  return device_id

@app.route('/logs/<dev_id_run>')
def get_logs(dev_id_run):
  dev_id, run_id = dev_id_run.split("=")
  base_d = log_t.DATA_DIR
  ret = {}
  for f in os.listdir(base_d):
    if not (run_id in os.listdir(base_d + '/' + f)):
      continue
    with open(base_d + '/' + f + '/' + run_id + '/' + log_t.LOGCAT_TXT, "r") as fin:
      ret['logcat'] = fin.read()
    with open(base_d + '/' + f + '/' + run_id + '/' + log_t.LOGCAT_T_TXT, "r") as fin:
      ret['logcat_t'] = fin.read()
  logcat_lines, logcat_t_lines = ret['logcat'].split('\n'), ret['logcat_t'].split('\n')
  in_logcat, in_t = [], []
  seen, seen_t = {}, {}
  LINE_LEN = 25
  for i in logcat_t_lines:
    if len(i) > LINE_LEN: seen_t[i[0:LINE_LEN]] = True
  for i in logcat_lines:
    if len(i) > LINE_LEN: seen[i[0:LINE_LEN]] = True
  for i, l in enumerate(logcat_lines):
    if len(l) > LINE_LEN and l[0:LINE_LEN] not in seen_t:
      in_logcat.append(i)
  for i, l in enumerate(logcat_t_lines):
    if len(l) > LINE_LEN and l[0:LINE_LEN] not in seen:
      in_t.append(i)
  ret['in_logcat'] = in_logcat
  ret['in_t'] = in_t
  return json.dumps(ret)

@app.route('/stat')
def get_stat():
  if logcat_run_inst_ == None:
    return "true"
  return json.dumps(logcat_run_inst_.iterations())

@app.route('/devices')
def get_devices():
  return json.dumps(devices_)

@app.route('/run_test', methods=['POST'])
def run_test():
  global logcat_run_inst_
  if request.method != 'POST':
    return not_found()
  if logcat_run_inst_ is not None:
    return "in progress"

  dev_id = request.data
  print dev_id, inv_device_id_[dev_id]
  logcat_run_inst_ = log_t.LogcatRun(inv_device_id_[dev_id], 10)
  return 'true'

def read_loop():
  global parsed_dirs_, run_records_
  while True:
    d = log_t.DATA_DIR
    if not (os.path.exists(d) and os.path.isdir(d)):
      time.sleep(2)
      continue
    for f in os.listdir(d):
      if f in parsed_dirs_: continue
      f_path = d + "/" + f + "/result.json"
      print f_path
      if not os.path.exists(f_path):
        continue
      parsed_dirs_[f] = True
      with open(f_path, "r") as fin:
        result_lines = json.loads(fin.read())
        print 'read:', len(result_lines)
        for result in result_lines:
          key = create_id(result["product"], result["sdk"], result["serial"])
          if key in run_records_:
            run_records_[key].append(result)
          else:
            run_records_[key] = [result]
    time.sleep(2)

def check_logcat_loop():
  global logcat_run_inst_
  while True:
    if logcat_run_inst_ is not None:
      if logcat_run_inst_.quit_:
        logcat_run_inst_ = None
    time.sleep(1)

def devices_loop():
  global devices_
  while True:
    devices_ = [find_device(x) for x in log_t.devices()]
    time.sleep(5)

# start read thread
read_thread = threading.Thread(target=read_loop)
read_thread.daemon = True
read_thread.start()

check_thread = threading.Thread(target=check_logcat_loop)
check_thread.daemon = True
check_thread.start()

devices_thread = threading.Thread(target=devices_loop)
devices_thread.daemon = True
devices_thread.start()
