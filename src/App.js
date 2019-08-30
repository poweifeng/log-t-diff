import React from 'react';
import './App.css';
import Button from '@material-ui/core/Button';
const RouterMixin = require('react-mini-router').RouterMixin;
const createReactClass = require('create-react-class');
import { makeStyles } from '@material-ui/core/styles';
import TextField from '@material-ui/core/TextField';
const api = require('./api.js').default;
import Paper from '@material-ui/core/Paper';


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
  return target * target;
}

function analyzeRecords(records) {
  let success = 0;
  let failure = 0;
  let wfailure = 0;
  let inT = 0;
  let inLogcat = 0;
  let inTBucket = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  let inLogcatBucket = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  records.forEach(record => {
    if (record.in_logat_not_t == 0 && record.in_t_not_logcat == 0) {
      success++;
    } else {
      failure++;
      wfailure += weightedFailure(record.in_t_not_logcat, record.logcat_t_length,
                                  record.in_logcat_not_t, record.logcat_length);
      let inTPerc = Math.min(1, record.in_t_not_logcat / (1. * record.logcat_t_length));
      let inLogcatPerc = Math.min(1, record.in_t_not_logcat / (1. * record.logcat_length));
      inTBucket[Math.floor(inTPerc * 9.999)]++;
      inLogcatBucket[Math.floor(inLogcatPerc * 9.999)]++;
    }
    inT += record.in_t_not_logcat;
    inLogcat += record.in_logcat_not_t;
  });
  return {
    success, failure, wfailure, inT, inLogcat, inTBucket, inLogcatBucket
  };
}

class SingleRecordWidget extends React.Component {

}

class RecordsWidget extends React.Component {
}

class DeviceWidget extends React.Component {
  constructor(props) {
    super(props);
    this.state = {records: [], analysis: {}};
  }

  clickRun() {
    api.post("run_test", this.props.deviceId).then(res => {
      console.log(res);
    });
  }

  checkRecords() {
    api.get("get_records/" + this.props.deviceId).then(res => {
      let recordsParsed = JSON.parse(res);
      let analysis = analyzeRecords(recordsParsed);
      this.setState({records: recordsParsed, analysis: analysis});
    });
  }

  componentWillMount() {
    const repeat = () => {
      if (!this.checkRecordsInst) {
        this.checkRecordsInst = setTimeout(repeat, 2000);
      }
      this.checkRecords();
      this.checkRecordsInst = null;
    };
    repeat();
  }

  render() {
    let comps = this.props.deviceId.split("+");
    const product = comps[0];
    const sdk = getSdk(comps[1]);
    const serial = comps[2];
    const deviceIdStyle = {
      display: "flex",
      flexDirection: "column",
    };
    const serialStyle = {
      fontSize: 12
    };
    const topRowStyle = {
      display: "flex",
      flexDirection: "row",
      justifyContent: 'space-between',
      width: 500,
      padding: 10
    }
    console.log(this.state.analysis);
    return (
      <Paper>
        <div style={topRowStyle}>
          <div style={deviceIdStyle}>
            <div>{product} ({sdk})</div>
            <div style={serialStyle}>{serial}</div>
          </div>
          <Button variant="contained" onClick={this.clickRun.bind(this)}>
            Start run
          </Button>
        </div>
      </Paper>
    );
  }
}

class WelcomePage extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      devices: []};
  }

  componentWillMount() {
    api.get("devices").then(res => {
      console.log(res);
      this.setState({devices: JSON.parse(res)});
    });
  }

  render() {
    const mainStyle = {
      display: "flex",
      flexDirection: "column",
      alignItems: "center"
    };
    const devices = this.state.devices.map((device) =>
      <DeviceWidget key={device} deviceId={device} />
    );
    return (
      <div style={mainStyle}>
        {devices}
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
        <div style={header}>Logcat debugging</div>
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
