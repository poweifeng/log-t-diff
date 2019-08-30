import React from 'react';
import './App.css';
import Button from '@material-ui/core/Button';
const RouterMixin = require('react-mini-router').RouterMixin;
const createReactClass = require('create-react-class');
import { makeStyles } from '@material-ui/core/styles';
import TextField from '@material-ui/core/TextField';
const api = require('./api.js').default;

const useStyles = makeStyles(theme => ({
  textField: {
    marginLeft: theme.spacing(1),
    marginRight: theme.spacing(1),
  },
  dense: {
    marginTop: theme.spacing(2),
  }
}));

class WelcomePage extends React.Component {
  constructor(props) {
    super(props);
    this.state = {name: ""};
  }

  componentWillMount() {
    api.get("devices").then(res => {
      console.log(JSON.parse(res));
    });
  }

  render() {
    return (
        <div style={{display: "flex", flexDirection: "column", alignItems: "center"}}>
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
