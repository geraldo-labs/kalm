import {
  Box,
  createStyles,
  ExpansionPanel,
  ExpansionPanelDetails,
  ExpansionPanelSummary,
  Theme,
  Typography,
} from "@material-ui/core";
import ExpandMoreIcon from "@material-ui/icons/ExpandMore";
import { WithStyles, withStyles } from "@material-ui/styles";
import React from "react";
import clsx from "clsx";

const styles = (theme: Theme) =>
  createStyles({
    root: {
      "&expanded": {
        margin: "auto",
      },
    },
    heading: {
      flexBasis: "20%",
      flexShrink: 0,
    },
    secondaryHeading: {
      fontSize: theme.typography.pxToRem(15),
      color: theme.palette.text.secondary,
    },
    error: {
      color: theme.palette.error.main,
    },
    detailsRoot: {
      // background: "#fff",
    },
  });

export interface ExpansionProps extends WithStyles<typeof styles> {
  title: React.ReactNode;
  hasError?: boolean;
  subTitle?: string;
  children?: React.ReactNode;
  defaultUnfold?: boolean;
  nested?: boolean;
}

interface State {
  isUnfolded: boolean;
}

class ExpansionRaw extends React.PureComponent<ExpansionProps, State> {
  constructor(props: ExpansionProps) {
    super(props);
    this.state = {
      isUnfolded: !!props.defaultUnfold,
    };
  }

  private renderHeader = () => {
    const { title, subTitle, classes } = this.props;

    if (typeof title === "string") {
      return (
        <>
          <Typography className={classes.heading}>{title}</Typography>
          {subTitle ? <Typography className={classes.secondaryHeading}>{subTitle}</Typography> : null}
        </>
      );
    }

    return title;
  };

  public render() {
    const { isUnfolded } = this.state;
    const { classes, children, hasError, nested } = this.props;
    return (
      <ExpansionPanel
        square
        className={clsx(classes.root)}
        variant={nested ? "elevation" : "outlined"}
        elevation={0}
        expanded={isUnfolded}
        onChange={() => this.setState({ isUnfolded: !isUnfolded })}
      >
        <ExpansionPanelSummary expandIcon={<ExpandMoreIcon />} className={clsx({ [classes.error]: hasError })}>
          {this.renderHeader()}
        </ExpansionPanelSummary>
        <ExpansionPanelDetails classes={{ root: classes.detailsRoot }} style={nested ? { padding: 0 } : {}}>
          <Box width={1}>{children}</Box>
        </ExpansionPanelDetails>
      </ExpansionPanel>
    );
  }
}

export const Expansion = withStyles(styles)(ExpansionRaw);
