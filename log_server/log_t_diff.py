import os
import subprocess
import re
import time
import datetime
import shutil
import threading
import random
import json

CUR_DIR = os.path.dirname(os.path.realpath(__file__))

TMP_TXT = ".tmp"
DATE_FRMT = "%m-%d %H:%M:%S.%f"
logcat_ = []
SLEEP_S = 1.2
LOGCAT_TXT = "logcat_dump.txt"
LOGCAT_T_TXT = "logcat_t_dump.txt"
DATA_DIR = "./data"
TEN_DAYS = datetime.timedelta(days=10)

def devices():
  total = ['adb', 'devices', '-l']
  res = ''
  with open(TMP_TXT, 'w') as fout:
    try:
      res = subprocess.check_output(total, env=dict(os.environ), stderr=fout)
    except subprocess.CalledProcessError as e:
      None
  with open(TMP_TXT, 'r') as fin:
    err = fin.read()
    if len(err) > 0:
      res = err
  return filter(lambda x: not "List" in x, res.strip().split("\n"))

def adb(cmds, target):
  device = wait_while_no_device(target)
  args = cmds.split(" ") if (len(cmds) > 0 or (' ' in cmds)) else []
  res = ''
  dev = ['-s', device] if device is not None else []
  total = ['adb'] + dev + args
  with open(TMP_TXT, 'w') as fout:
    try:
      res = subprocess.check_output(total, env=dict(os.environ), stderr=fout)
    except subprocess.CalledProcessError as e:
      None
  with open(TMP_TXT, 'r') as fin:
    err = fin.read()
    if len(err) > 0:
      res = err
  return res.strip()

def str_to_date(s):
  if not "  " in s:
    return None
  date_str = " ".join(s.split(" ")[0:2])
  date_obj = datetime.datetime.strptime(date_str, DATE_FRMT)
  now = datetime.datetime.now()
  return date_obj.replace(year=now.year)

def date_to_str(date):
  return date.strftime(DATE_FRMT)[:-3]

def dump_logs(logcat, fname):
  with open(fname, "w") as fout:
    fout.write("\n".join([a.strip() for b, a in logcat]))

def logcat_thread_func(run, target):
  device = wait_while_no_device(target)
  print('device:', device)
  while not run.quit_:
    process = subprocess.Popen(['adb', '-s', device, "logcat"], stdout=subprocess.PIPE)
    run.logcat_ = []
    count = 0
    while process.poll() is None and not run.quit_:
      now = datetime.datetime.now()
      output = process.stdout.readline()
      if output is None or len(output) == 0:
        break
      if "  " in output and 'beginning of ' not in output:
        date_obj = str_to_date(output)
        delta = datetime.timedelta(seconds=abs((now - date_obj).total_seconds()))
        if delta > TEN_DAYS:
          print output
          continue
        #print(date_to_str(date_obj))
        run.logcat_.append((date_obj, output))
      else:
        continue
    time.sleep(.5)

def clean_timestamp(st):
  return date_to_str(st).replace(" ", "_").replace(":", "_").replace(".","_")

def find_product_name(target):
  for d in devices():
    if not target in d:
      continue
    for substr in d.split(" "):
      if 'product:' in substr:
        return substr.split(':')[1]
  return ''

def mkdir_if_not_exist(d):
  if not (os.path.exists(d) and os.path.isdir(d)):
    os.mkdir(d)

def logcat_t_thread_func(run, target, iterations):
  print 'start logcat t thread'
  def timestamp_not_in(seen, alist):
    ret = []
    for ts, a in alist:
      if ts not in seen:
        ret.append((ts, a))
    return ret

  def r_adb(ts):
    res = ''
    dev = ['-s', device] if device is not None else []
    total = ['adb'] + dev + ['logcat', '-t', ts]
    with open(TMP_TXT, 'w') as fout:
      try:
        res = subprocess.check_output(total, env=dict(os.environ), stderr=fout)
      except subprocess.CalledProcessError as e:
        None
    with open(TMP_TXT, 'r') as fin:
      err = fin.read()
      if len(err) > 0:
        res = err
    return res.strip()

  def mark_seen(ts, seen):
    seen[ts] = 1 if ts not in seen else seen[ts] + 1

  mkdir_if_not_exist(DATA_DIR)

  device = wait_while_no_device(target)
  product = find_product_name(target)
  mkdir_if_not_exist(product)

  start_time = datetime.datetime.now()

  output_prefix = DATA_DIR + "/" + product + "_" + clean_timestamp(start_time)
  mkdir_if_not_exist(output_prefix)

  it = 0
  results = []

  serial = adb('shell getprop ro.serialno', device)
  sdk_num = adb('shell getprop ro.build.version.sdk', device)

  run.current_iter_ = 0
  for it in range(iterations):
    print 'running', it
    run.current_iter_ = it
    run.logcat_.sort(key=lambda x: x[0])
    log_len = len(run.logcat_)
    if log_len == 0:
      print 'sleep'
      time.sleep(5)
      continue

    r = random.randint(0, log_len - 1)
    timestamp = run.logcat_[r][0]
    rstrs = r_adb(date_to_str(timestamp)).split("\n")

    logcat_filtered = filter(lambda (ts, _): ts >= timestamp, run.logcat_)
    logcat_t = map(lambda x: (str_to_date(x), x),
              filter(lambda x: 'beginning of ' not in x, rstrs))
    seen, tseen = {}, {}
    map(lambda (ts, _): mark_seen(ts, seen), logcat_filtered)
    map(lambda (ts, _): mark_seen(ts, tseen), logcat_t)

    in_logcat_not_t = timestamp_not_in(tseen, logcat_filtered)
    in_t_not_logcat = timestamp_not_in(seen, logcat_t)

    run_name = clean_timestamp(timestamp)
    stamp_dir = output_prefix + "/" + run_name
    mkdir_if_not_exist(stamp_dir)
    uptime = adb('shell cat /proc/uptime', device).split(" ")[0]
    result = {
        "product": product,
        "serial": serial,
        "sdk": sdk_num,
        "run_name": run_name,
        "uptime": uptime,
        "logcat_length": len(logcat_filtered),
        "logcat_t_length": len(logcat_t),
        "in_logcat_not_t": len(in_logcat_not_t),
        "in_t_not_logcat": len(in_t_not_logcat)
    }
    if len(in_t_not_logcat) > 0 or len(in_logcat_not_t) > 0:
      dump_logs(logcat_filtered, stamp_dir + "/" + LOGCAT_TXT)
      dump_logs(logcat_t, stamp_dir + "/" + LOGCAT_T_TXT)

    results.append(result)
    time.sleep(SLEEP_S)

  print 'done'
  with open(output_prefix + "/result.json", "w") as fout:
    fout.write(json.dumps(results))

  run.quit()

def wait_while_no_device(target):
  iid = None
  while iid == None:
    for line in devices():
      if target in line:
        words = re.split("[\s]+", line)
        iid = words[0]
    time.sleep(1)
  return iid

def pick_device():
  devs = devices()
  x = ""
  while not x.isdigit():
    for i, dev in  enumerate(devices()):
      print("[%d]: " % (i) + dev)
    x = raw_input('pick a device: ')
  return wait_while_no_device(devs[int(x)])

class LogcatRun:
  def __init__(self, device, iterations):
    self.quit_ = False
    self.logcat_ = []
    self.current_iter_ = 0
    self.iterations_ = iterations

    adb('logcat -P ""', device)

    logcat_thread = threading.Thread(target=logcat_thread_func, args=(self, device))
    logcat_thread.daemon = True
    logcat_thread.start()

    logcat_t_thread = threading.Thread(target=logcat_t_thread_func, args=(self, device, iterations))
    logcat_t_thread.daemon = True
    logcat_t_thread.start()

  def quit(self):
    self.quit_ = True

  def iterations(self):
    return [self.current_iter_, self.iterations_]

def setup():
  dev = pick_device()
  adb('logcat -P ""', dev)
  run = LogcatRun(dev, 10)

  while not run.quit_:
      try:
        time.sleep(1)
      except KeyboardInterrupt:
        print('done')
        exit(1)

if __name__ == '__main__':
  setup()
