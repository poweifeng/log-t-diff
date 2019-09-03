import React from 'react';
import './App.css';
import Button from '@material-ui/core/Button';
const RouterMixin = require('react-mini-router').RouterMixin;
const createReactClass = require('create-react-class');
import { makeStyles, withStyles } from '@material-ui/core/styles';
import TextField from '@material-ui/core/TextField';
const api = require('./api.js').default;
import Paper from '@material-ui/core/Paper';
import Chartjs from 'chart.js/dist/Chart.min';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
//import diffLines from 'diff/dist/diff';

const useStyles = makeStyles(theme => ({
  textField: {
    marginLeft: theme.spacing(1),
    marginRight: theme.spacing(1),
  },
  dense: {
    marginTop: theme.spacing(2),
  }
}));

const StyledDialog = withStyles({
  paperWidthSm: {
    maxWidth: 1500
  }
})(Dialog);

const RED = '#ff4040';
const BLACK = "#000000";
const BLUE = '#5080ff';
const WHITE = '#ffffff';

function getSdk(sdkNum) {
  switch(sdkNum) {
    case '29': return 'Q';
    case '28': return 'P';
    case '27': return 'O-mr1';
    case '26': return 'O';
    case '25': return 'N-mr1';
    case '24': return 'N';
    default: return 'Unknown'
  }
}

function weighted(inT, tLength) {
  let target = Math.min(1, inT / (1.0 * tLength));
  return Math.sqrt(target);
}

function analyzeRecords(records) {
  const bucketLength = 11;
  let success = 0;
  let failure = 0;
  let wfailure = 0;
  let wsuccess = 0;
  let inT = 0;
  let inLogcat = 0;
  let inTBucket = Array(bucketLength).fill(0);
  let inLogcatBucket = Array(bucketLength).fill(0);

  records.forEach(record => {
    console.log(record.in_logcat_not_t, record.in_t_not_logcat);
    if (record.in_logcat_not_t == 0 && record.in_t_not_logcat == 0) {
      success++;
      wsuccess += 1;
    } else {
      failure++;
      let fval = weighted(record.in_t_not_logcat, record.logcat_t_length) * .5 +
          weighted(record.in_logcat_not_t, record.logcat_length) * .5;
      wfailure += fval;
      wsuccess += (1 - fval);
      let inTPerc = weighted(record.in_t_not_logcat, record.logcat_t_length);
      let inLogcatPerc = weighted(record.in_logcat_not_t, record.logcat_length);
      inTBucket[Math.floor(inTPerc * (bucketLength * .999))]++;
      inLogcatBucket[Math.floor(inLogcatPerc * (bucketLength * .999))]++;
    }
    inT += record.in_t_not_logcat;
    inLogcat += record.in_logcat_not_t;
  });
  return {
    success, failure, wfailure, wsuccess, inT, inLogcat, inTBucket, inLogcatBucket
  };
}

class LogsDialog extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      logs: null
    };
  }
  componentDidUpdate(prevProps) {
    if (!this.state.logs && this.props.open && !this.props.success) {
      if (!!this.props.recordId && !!this.props.deviceId) {
        let path = this.props.deviceId + "=" + this.props.recordId;
        api.get('logs/' + path ).then((res) => {
          let logs = JSON.parse(res);
          this.setState({logs})
        });
      }
    }
  }
  render() {
    if (!this.props.recordId || !this.props.deviceId ) {
      return (<div></div>);
    }
    const WIDTH = 500;
    const GREEN = 'rgba(90, 255, 90, .8)';
    const BLACK = 'white';
    let haslogs = !!this.state.logs;
    let logLines = haslogs ? this.state.logs.map(
      (line, ind) => {
        const leftMissing = line[0] == 0;
        const rightMissing = line[1] == 0;
        let leftStyle = {
          width: WIDTH,
          backgroundColor: rightMissing ? GREEN : BLACK
        };
        let rightStyle = {
          width: WIDTH,
          backgroundColor: leftMissing ? GREEN : BLACK
        };
        let left = leftMissing ? '' : line[0];
        let right = rightMissing ? '' : (leftMissing ? line[1] : line[0]);
        return (
            <div style={{display: "flex", flexDirection: "row"}} key={ind}>
              <div style={leftStyle}>{left}</div>
              <div style={rightStyle}>{right}</div>
            </div>
        );
      }
    ) : [];
    const close = () => {
      this.setState({logs: null});
      this.props.onClose();
    };
    return (
      <StyledDialog style={{maxWidth: 2000, minWidth: 1000, position: "absolute"}} open={this.props.open} onClose={close}>
        <DialogTitle>{this.props.recordId}</DialogTitle>
        <div style={{dislay: "flex", flexDirection: "row", fontSize: 9}}>
          <div style={{dislay: "flex", flexDirection: "column"}}>
            {logLines}
          </div>
        </div>
      </StyledDialog>
    );
  }
}

function transformColor(color) {
  let r = parseInt(color.substring(1,3), 16);
  let g = parseInt(color.substring(3,5), 16);
  let b = parseInt(color.substring(5,7), 16);
  return {r, g, b};
}

function interpolateColor(colorA, colorB, t) {
  const pad = (a) => a.length < 2 ? "0" + a : a;
  let ca = transformColor(colorA);
  let cb = transformColor(colorB);
  let r = Math.round(ca.r * (1 - t) + cb.r * t);
  let g = Math.round(ca.g * (1 - t) + cb.g * t);
  let b = Math.round(ca.b * (1 - t) + cb.b * t);
  let ret ="rgba(" + Math.round(r) + "," + Math.round(g) + "," + Math.round(b) + ",.7)";
  return ret;
}

function determineSuccess(errACount, errBCount) {
  const COUNT_LIMIT = 5;
  return Math.max(errACount, errBCount) < COUNT_LIMIT;
}

class SingleRecordWidget extends React.Component {
  constructor(props) {
    super(props);
  }
  getTimeStr(uptime) {
    const pad = (x) => x > 10 ? "" + x: "0" + x;
    let allSeconds = Math.round(uptime);
    let seconds = allSeconds % 60;
    let minutes = Math.floor(allSeconds / 60) % 60;
    let hours = Math.floor(allSeconds / 3600);
    return hours + ":" + pad(minutes) + ":" + seconds;
  }
  render() {
    let record = this.props.record;
    let uptimeStr = this.getTimeStr(record.uptime);
    let success = determineSuccess(record.in_t_not_logcat, record.in_logcat_not_t);
    let tErrorP = weighted(record.in_t_not_logcat, record.logcat_t_length);
    let tError = Math.round(tErrorP * 100) / 100;
    let logcatErrorP = weighted(record.in_logcat_not_t, record.logcat_length);
    let logcatError = Math.round(logcatErrorP * 100) / 100;
    let resultColor = success ? BLUE : RED;
    const styleT = {
      padding: "3px 5px",
      backgroundColor: tErrorP === 0 ? WHITE : interpolateColor(BLUE, RED, Math.min(1, 1.5 * tErrorP)),
      color: tErrorP > 0 ? WHITE : BLACK,
      borderRadius: 3
    };
    const styleLogcat = {
      padding: "3px 5px",
      backgroundColor: logcatErrorP === 0 ? WHITE : interpolateColor(BLUE, RED, Math.min(1, 1.5 * logcatErrorP)),
      color: logcatErrorP > 0 ? WHITE : BLACK,
      borderRadius: 3
    };
    return (
      <div style={{margin: "5px 0", border: "1px solid",
                   borderRadius: 5, padding: 5, borderColor: resultColor}}>
          <div style={{fontWeight: 700, color: resultColor, cursor: success ? "default" : "pointer"}}
               onClick={() => {
                 if (!success && this.props.setOpen) {
                   this.props.setOpen();
                 }
               }}>
            {record.run_name}</div>
          <div style={{marginTop: 10, display: "flex", flexDirection: "row", fontSize: 12, justifyContent: 'space-between'}}>
          <div>Up time: {uptimeStr}</div>
          <div>T missed lines: <span style={styleT}>{record.in_t_not_logcat} / {record.logcat_t_length} ({tError})</span></div>
          <div>Logcat missed lines: <span style={styleLogcat}>{record.in_logcat_not_t} / {record.logcat_length} ({logcatError})</span></div>
        </div>
      </div>
    );
  }
}

class RecordsWidget extends React.Component {
  render() {
    const records = this.props.records.map(
      (r, ind) => {
        const open  = () => this.props.setOpen(this.props.deviceId, r.run_name);
        return <SingleRecordWidget deviceId={this.props.deviceId} setOpen={open}
            key={r.run_name + "_" + ind} record={r} />
      }
    );
    return (
      <div style={{display: "flex", flexDirection: "column"}}>
        {records}
      </div>
    );
  }
}

class DeviceWidget extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      records: [],
      analysis: {},
      leftRunningTime: 0,
      showMore: false
    };
    this.inLogcatBucketChartRef = React.createRef();
    this.inTBucketChartRef = React.createRef();
  }

  clickRun() {
    api.post("run_test", this.props.deviceId).then(res => {
      if (res == 'true') {
        this.setState({leftRunningTime: 1});
      }
    });
  }

  clickReboot() {
    api.get("reboot/" + this.props.deviceId).then(res => {
      console.log('reboot => ' + res);
      this.props.updateDevices();
    });
  }

  checkRecords() {
    api.get("get_records/" + this.props.deviceId).then(res => {
      let records = JSON.parse(res);
      if (records.length != this.state.records.length) {
        this.setState({records});
      }
    });
  }

  checkRunnable() {
    api.get("stat").then(res => {
      if (res == 'true') {
        if (this.state.leftRunningTime > 0) {
          this.setState({leftRunningTime: 0});
        }
      } else {
        let results = JSON.parse(res);
        let perc = 1;
        if (results[0] > 0) {
          perc = Math.round(100 * (results[0]/ (1. * (results[1] - 1))));
        }
        if (this.state.leftRunningTime != perc) {
          this.setState({leftRunningTime: perc});
        }
      }
    });
  }

  componentWillMount() {
    const repeat = (instVar, timeout, func) => () => {
      if (!this[instVar]) {
        this[instVar] = setTimeout(repeat(instVar, timeout, func), timeout);
      }
      func();
      this[instVar] = null;
    };
    (repeat('checkRecordsInst', 2000, this.checkRecords.bind(this)))();
    (repeat('checkRunnableInst', 750, this.checkRunnable.bind(this)))();
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevState.records.length != this.state.records.length) {
      let analysis = analyzeRecords(this.state.records);
      const updateBucketChart = (ctx, indata, title) => {
        if (ctx != null) {
          const options = { responsive: false};
          this.recordCharts = new Chartjs.Chart(ctx, {
            type: 'bar',
            data: {
              labels: indata.map((r, i) => Math.round(100 * (i / (indata.length - 1))) / 100),
              datasets: [{
                label: title,
                data: indata
              }]
            },
            options
          });
        }
      }
      updateBucketChart(this.inLogcatBucketChartRef.current,
                        analysis.inLogcatBucket, "In \"logcat\" Not in \"logcat -t\"");
      updateBucketChart(this.inTBucketChartRef.current,
                        analysis.inTBucket, "In \"logcat -t\" Not in \"logcat\"");
      this.setState({analysis});
    }
  }

  render() {
    let comps = this.props.deviceId.split("+");
    const product = comps[0];
    const sdk = getSdk(comps[1]);
    const serial = comps[2];
    const deviceIdStyle = {
      display: "flex",
      flexDirection: "column",
      fontSize: 20,
      color: this.props.available ? 'black' : '#999'
    };
    const serialStyle = {
      fontSize: 12
    };
    const topRowStyle = {
      display: "flex",
      flexDirection: "row",
      justifyContent: 'space-between',
      width: 500,
      marginBottom: 15
    }
    const analysis = this.state.analysis;
    const records = this.state.records;
    const successP = Math.round(100 * (analysis.success / (1. * records.length)));
    const weightedTotal = (analysis.wsuccess + analysis.wfailure) * 1.;
    const weightedP = Math.round(100 * (analysis.wsuccess / weightedTotal));
    return (
      <Paper style={{margin: "15px 0", padding: 10, display: "flex", flexDirection: "column" }}>
        <div style={topRowStyle}>
          <div style={deviceIdStyle}>
            <div>{product} ({sdk}) {!this.props.available ? ' - unavailable' : ''}</div>
            <div style={serialStyle}>{serial}</div>
          </div>
        </div>
        <div style={{fontSize: 13}}>
          <div>Runs: {records.length}</div>
          <div>Test Passed Percentage: {successP}%</div>
          <div>Weighted Test Passed Percentage (<span style={{fontFamily: 'serif', fontStyle: 'italic'}}>W</span>): {weightedP}%</div>
        </div>
        <div style={{display: "flex", flexDirection: "row", marginTop: 10}}>
          <canvas ref={this.inLogcatBucketChartRef} style={{width: 250, height: 250}}>
          </canvas>
          <canvas ref={this.inTBucketChartRef} style={{width: 250, height: 250}}>
          </canvas>
        </div>
        <div style={{display: "flex", flexDirection: "row", alignSelf: "flex-end", marginBottom: 15, marginTop: 10}}>
             {this.props.available ?
               <Button style={{marginRight: 8}} variant="contained" onClick={this.clickReboot.bind(this)}>
                 Reboot
               </Button> :
              null}
            <Button variant="contained" onClick={this.clickRun.bind(this)}
                    disabled={!this.props.available || this.state.leftRunningTime > 0}>
              {this.state.leftRunningTime > 0 ? this.state.leftRunningTime + "%" : "Start run"}
            </Button>
          </div>
          { this.state.showMore ?
            <RecordsWidget deviceId={this.props.deviceId} records={this.state.records}
              setOpen={this.props.setOpen}/> :
            null }
        <Button variant="contained" style={{alignSelf: "flex-end"}}
            onClick={() => this.setState({showMore: !this.state.showMore})}>
          {this.state.showMore ? "Hide" : "Show Runs"}
        </Button>
      </Paper>
    );
  }
}

class WelcomePage extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      devices: [],
      open: {}
    };
  }

  checkDevices() {
    api.get("devices").then(res => {
      let devicesMap = JSON.parse(res);
      let devices = [];
      for (var i in devicesMap) {
        devices.push({name: i, available: devicesMap[i]});
      }
      this.setState({devices});
    });
  }

  componentWillMount() {
    const repeat = () => {
      if (!this.checkDevicesInst) {
        this.checkDevicesInst = setTimeout(repeat, 5000);
      }
      this.checkDevices();
      this.checkDevicesInst = null;
    };
    repeat();
  }

  setOpen(deviceId, recordId) {
    this.setState({
      open: {
        deviceId, recordId
      }
    });
  }

  render() {
    const mainStyle = {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      openDeviceId: null
    };
    const devices = this.state.devices.map(
        (device) =>
          <DeviceWidget key={device.name} deviceId={device.name} available={device.available}
              setOpen={this.setOpen.bind(this)} updateDevices={this.checkDevices.bind(this)}/>
    );
    return (
      <div style={mainStyle}>
        {devices}
        <LogsDialog recordId={this.state.open.recordId}
           deviceId={this.state.open.deviceId}
           onClose={() => this.setState({open: {}})}
           open={!!this.state.open.deviceId} />
      </div>
    );
  }
}

class Template extends React.Component {
  render() {
    const style = {
      width: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center"
    };
    const header = {
      fontSize: 36,
      margin: "20px 0 40px 0"
    };
    return (
        <div style={style}>
        <div style={header}>'logcat -t' debugging</div>
          {this.props.insert}
        </div>
    );
  }
}

const App = createReactClass({
  mixins: [RouterMixin],

  routes: {
    '/': 'welcome',
    '/message/:text': 'message'
  },

  welcome: () => <WelcomePage />,

  componentWillMount: function() {
  },

  render: function() {
    var dom = this.renderCurrentRoute();
    return (
        <Template insert={dom} />
    );
  },

  message: function(text) {
    return <div>{text}</div>;
  },

  notFound: function(path) {
    return <div className="not-found">Page Not Found: {path}</div>;
  }
});
export default App;
