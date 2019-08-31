import React from 'react';
import './App.css';
import Button from '@material-ui/core/Button';
const RouterMixin = require('react-mini-router').RouterMixin;
const createReactClass = require('create-react-class');
import { makeStyles } from '@material-ui/core/styles';
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

function weightedFailure(inT, tLength, inLogcat, logcatLength) {
  let target = Math.min(1, inT / (1.0 * tLength)) * .5 +
               Math.min(1, inLogcat / (1.0 * logcatLength)) * .5;
  return Math.min(1.0, Math.sqrt(target));
}

function analyzeRecords(records) {
  const bucketLength = 40;
  let success = 0;
  let failure = 0;
  let wfailure = 0;
  let inT = 0;
  let inLogcat = 0;
  let inTBucket = Array(bucketLength).fill(0);
  let inLogcatBucket = Array(bucketLength).fill(0);

  records.forEach(record => {
    console.log(record.in_logcat_not_t, record.in_t_not_logcat);
    if (record.in_logcat_not_t == 0 && record.in_t_not_logcat == 0) {
      success++;
    } else {
      failure++;
      wfailure += weightedFailure(record.in_t_not_logcat, record.logcat_t_length,
                                  record.in_logcat_not_t, record.logcat_length);
      let inTPerc = Math.min(1, record.in_t_not_logcat / (1. * record.logcat_t_length));
      let inLogcatPerc = Math.min(1, record.in_t_not_logcat / (1. * record.logcat_length));
      inTBucket[Math.floor(inTPerc * (bucketLength * .999))]++;
      inLogcatBucket[Math.floor(inLogcatPerc * (bucketLength * 9.999))]++;
    }
    inT += record.in_t_not_logcat;
    inLogcat += record.in_logcat_not_t;
  });
  return {
    success, failure, wfailure, inT, inLogcat, inTBucket, inLogcatBucket
  };
}

class LogsDialog extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      logs: null,
      inLog: {},
      inT: {}
    };
  }
  componentDidUpdate(prevProps) {
    if (!this.state.logs && this.props.open && !this.props.success) {
      console.log('ab', this.props.record.run_name, this.props.deviceId);
      if (this.props.record.run_name && this.props.deviceId) {
        let path = this.props.deviceId + "=" + this.props.record.run_name;
        api.get('logs/' + path ).then((res) => {
          let logs = JSON.parse(res);
          console.log('logs', logs);
          let inLog = {};
          let inT = {};
          logs.in_logcat.forEach((l) => inLog[l] = true);
          logs.in_t.forEach((l) => inT[l] = true);
          logs.logcat = logs.logcat.split("\n");
          logs.logcat_t = logs.logcat_t.split("\n");
          this.setState({logs, inLog, inT})
        });
      }
    }
  }
  render() {
    const GREEN = '#66ff77';
    let haslogs = !!this.state.logs && !!this.state.logs.logcat;
    let inLog = this.state.inLog;
    let inT = this.state.inT;
    let logLines = haslogs ? this.state.logs.logcat.map(
        (line, ind) => {
          let color = (inLog[ind]) ? GREEN : 'black';
          return <div key={ind} style={{color}}>{line}</div>;
        }
    ) : [];
    let logtLines = haslogs ? this.state.logs.logcat_t.map(
        (line, ind) => {
          let color = (inT[ind]) ? GREEN : 'black';
          return <div key={ind} style={{color}}>{line}</div>;
        }
    ) : [];
    return (
      <Dialog style={{maxWidth: 2000, minWidth: 1000, position: "absolute"}} open={this.props.open} onClose={this.props.onClose}>
        <DialogTitle>{this.props.record.run_name}</DialogTitle>
        <div style={{dislay: "flex", flexDirection: "row", fontSize: 9}}>
          <div style={{dislay: "flex", flexDirection: "column"}}>
            {logLines}
          </div>
          <div style={{dislay: "flex", flexDirection: "column"}}>
            {logtLines}
          </div>
        </div>
      </Dialog>
    );
  }
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
    let success = record.in_t_not_logcat == 0 && record.in_logcat_not_t == 0;
    let resultColor = success ? '#5080ff' : '#ff4040';
    return (
      <div style={{margin: "5px 0", border: "1px solid",
                   borderRadius: 5, padding: 5, borderColor: resultColor}}>
          <div style={{fontWeight: 700, color: resultColor}}
               onClick={() => {
                 if (success) {
                   return;
                 }
                 this.props.setOpen(this.props.deviceId, this.props.record);
               }}>
            {record.run_name}</div>
          <div style={{marginTop: 10, display: "flex", flexDirection: "row", fontSize: 12, justifyContent: 'space-between'}}>
          <div>Up time: {uptimeStr}</div>
          <div>T missed lines: {record.in_t_not_logcat} / {record.logcat_t_length}</div>
          <div>Logcat missed lines: {record.in_logcat_not_t} / {record.logcat_length}</div>
        </div>
      </div>
    );
  }
}

class RecordsWidget extends React.Component {
  render() {
    const records = this.props.records.map(
        r => <SingleRecordWidget deviceId={this.props.deviceId} setOpen={this.setOpen}
                                 key={r.run_name} record={r} />);
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
      console.log(res);
      if (res == 'true') {
        this.setState({leftRunningTime: 1});
      }
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
    (repeat('checkRunnableInst', 500, this.checkRunnable.bind(this)))();
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
              labels: indata.map((r, i) => i),
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
      fontSize: 20
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
    const weightedP = Math.round(100 * (analysis.success /
                                        (1. * (analysis.success + analysis.wfailure))));

    return (
      <Paper style={{margin: "15px 0", padding: 10, display: "flex", flexDirection: "column" }}>
        <div style={topRowStyle}>
          <div style={deviceIdStyle}>
            <div>{product} ({sdk}) {!this.props.available ? ' - unavailable' : ''}</div>
            <div style={serialStyle}>{serial}</div>
          </div>
          <Button variant="contained" onClick={this.clickRun.bind(this)}
                  disabled={!this.props.available || this.state.leftRunningTime > 0}>
            {this.state.leftRunningTime > 0 ? this.state.leftRunningTime + "%" : "Start run"}
          </Button>
        </div>
        <div>
          <div>Runs: {records.length}</div>
          <div>Success Percentage: {successP}%</div>
          <div>Weighted Success Percentage: {weightedP}%</div>
        </div>
        <div style={{display: "flex", flexDirection: "row", marginTop: 10}}>
          <canvas ref={this.inLogcatBucketChartRef} style={{width: 250, height: 250}}>
          </canvas>
          <canvas ref={this.inTBucketChartRef} style={{width: 250, height: 250}}>
          </canvas>
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

  setOpen(deviceId, record) {
    this.setState({
      open: {
        deviceId, record
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
              setOpen={this.setOpen.bind(this)} />
    );
    return (
      <div style={mainStyle}>
        {devices}
        <LogsDialog record={this.state.open.record}
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
