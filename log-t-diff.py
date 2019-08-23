import os
import subprocess
import re
import time
import datetime
import shutil
import threading
import random

CUR_DIR = os.path.dirname(os.path.realpath(__file__))

TMP_TXT = ".tmp"
DATE_FRMT = "%m-%d %H:%M:%S.%f"
logcat_ = []
RUN_PREFIX = "run"
SLEEP_S = 3
LOGCAT_TXT = "logcat_dump.txt"
LOGCAT_T_TXT = "logcat_t_dump.txt"

quit_ = False

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
  return datetime.datetime.strptime(date_str, DATE_FRMT)

def date_to_str(date):
  return date.strftime(DATE_FRMT)[:-3]

def logcat_thread_func(target):
  global logcat_
  device = wait_while_no_device(target)
  print('device:', device)
  while not quit_:
    process = subprocess.Popen(['adb', '-s', device, "logcat"], stdout=subprocess.PIPE)
    logcat_ = []
    count = 0
    while process.poll() is None and not quit_:
      output = process.stdout.readline()
      if output is None or len(output) == 0:
        break
      if "  " in output and 'beginning of ' not in output:
        date_obj = str_to_date(output)
        #print(date_to_str(date_obj))
        logcat_.append((date_obj, output))
      else:
        continue
    time.sleep(.5)

def dump_logs(logcat, fname):
  with open(fname, "w") as fout:
    fout.write("\n".join([a.strip() for b, a in logcat]))

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

def get_run_number(d):
  if not (os.path.exists(d) and os.path.isdir(d)):
    return 0

  m_run = 0
  for f in os.listdir(d):
    if RUN_PREFIX in f:
      run = int(f.replace(RUN_PREFIX, ""))
      m_run = max(m_run, run)
  return m_run

def pad_num_3(i):
  if i > 100: return i
  if i < 10: return '00' + str(i)
  if i < 100: return '0' + str(1)

def logcat_t_thread_func(target):
  global quit_
  device = wait_while_no_device(target)
  product = find_product_name(target)
  mkdir_if_not_exist(product)
  this_run = get_run_number(product) + 1
  output_prefix = product + "/" + RUN_PREFIX + pad_num_3(this_run)
  mkdir_if_not_exist(output_prefix)

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

  print('device:', device)
  while not quit_:
    logcat_.sort(key=lambda x: x[0])
    log_len = len(logcat_)
    if log_len == 0:
      print 'sleep'
      time.sleep(5)
      continue

    r = random.randint(0, log_len - 1)
    time_stamp = logcat_[r][0]
    rstrs = r_adb(date_to_str(time_stamp)).split("\n")

    print '-----------\n', date_to_str(time_stamp), '\n'

    seen = {}
    es = []
    for ts, o in logcat_:
      if ts >= time_stamp:
        es.append((ts, o))
        if ts in seen:
          seen[ts] += 1
        else:
          seen[ts] = 1

    res = map(lambda x: (str_to_date(x), x),
              filter(lambda x: 'beginning of ' not in x, rstrs))

    rseen = {}
    for ts, output in res:
      if ts in rseen:
        rseen[ts] += 1
      else:
        rseen[ts] = 1

    rvals = timestamp_not_in(rseen, es)
    vals = timestamp_not_in(seen, res)

    print (len(es), len(rvals)), (len(res), len(vals))
    if len(rvals) > 0 or len(vals) > 0:
      stamp_dir = output_prefix + "/" + date_to_str(time_stamp).replace(" ", "_").replace(":", "_").replace(".","_")
      mkdir_if_not_exist(stamp_dir)
      dump_logs(es, stamp_dir + "/" + LOGCAT_TXT)
      dump_logs(res, stamp_dir + "/" + LOGCAT_T_TXT)
    time.sleep(SLEEP_S)

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

def setup():
  dev = pick_device()
  adb('logcat -P ""', dev)
  logcat_thread = threading.Thread(target=logcat_thread_func, args=(dev,))
  logcat_thread.daemon = True
  logcat_thread.start()

  logcat_t_thread = threading.Thread(target=logcat_t_thread_func, args=(dev,))
  logcat_t_thread.daemon = True
  logcat_t_thread.start()

  while True:
      try:
        time.sleep(1)
      except KeyboardInterrupt:
        print('done')
        exit(1)

setup()
