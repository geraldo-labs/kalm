import React from "react";
import { Box, createStyles, Theme, Typography, withStyles, WithStyles, withTheme, WithTheme } from "@material-ui/core";
import { Doughnut } from "react-chartjs-2";
import { CenterCaption } from "./Label";
import { green, grey, red } from "@material-ui/core/colors";
import * as chartjs from "chart.js";

const size = 104;
const smallSize = 82;
const defaultColors = [green[700], grey[700], red[700]];

const styles = (theme: Theme) =>
  createStyles({
    root: {},
    pieChartWrapper: {
      flex: 1,
      display: "flex",
      alignItems: "center",
      position: "relative",
      justifyContent: "center",
    },
    icon: {
      position: "absolute",
      color: theme.palette.type === "light" ? theme.palette.text.secondary : theme.palette.text.primary,
    },
    text: {
      display: "flex",
      justifyContent: "center",
    },
  });

interface Props extends WithStyles<typeof styles>, WithTheme {
  title: string;
  labels: string[];
  data: number[];
  insideLabel?: boolean;
  icon?: React.ReactNode;
}

interface State {}

class DoughnutChartRaw extends React.PureComponent<Props, State> {
  private getData = (): chartjs.ChartData => {
    let { labels, data, theme } = this.props;

    let colors: string[] = defaultColors;
    const dataSum = data.reduce((a, b) => a + b, 0);
    if (dataSum === 0) {
      data = [0, 1]; // show grey
      colors[1] = theme.palette.type === "light" ? grey[400] : grey[800];
    }

    return {
      labels,
      datasets: [
        {
          data,
          borderWidth: 2,
          backgroundColor: colors,
          borderColor: theme.palette.type === "light" ? undefined : grey[800],
          hoverBackgroundColor: colors,
        },
      ],
    };
  };

  private renderLabels = (dataSum: number, labels: string[], data: number[], title: string) => {
    return (
      <Box mt={1}>
        {dataSum === 0 && (
          <Box display="flex" alignItems="center" justifyContent="center">
            <Typography variant="body2">No {title}</Typography>
          </Box>
        )}

        {labels.map((label, index) => {
          if (data[index] === 0) {
            return null;
          } else {
            return (
              <Box display="flex" alignItems="center" justifyContent="space-between" key={label}>
                <Box style={{ backgroundColor: defaultColors[index] }} width={10} height={10} mr={1}></Box>
                <Typography variant="body2">
                  {label}({data[index]})
                </Typography>
              </Box>
            );
          }
        })}
      </Box>
    );
  };

  public render() {
    const { classes, labels, data, title, icon } = this.props;
    const dataSum = data.reduce((a, b) => a + b, 0);
    const chartData: chartjs.ChartData = this.getData();
    return (
      <div className={classes.root} style={{ width: size, minWidth: size }}>
        {title && <CenterCaption>{title}</CenterCaption>}
        <div className={classes.pieChartWrapper}>
          <Box className={classes.icon} zIndex={1}>
            {icon ? icon : null}
          </Box>
          <Box zIndex={10} width={icon ? smallSize : size} height={icon ? smallSize : size}>
            <Doughnut
              height={icon ? smallSize : size}
              width={icon ? smallSize : size}
              data={chartData}
              options={{
                maintainAspectRatio: false,
                cutoutPercentage: icon ? 65 : 70,
                tooltips: { enabled: dataSum === 0 ? false : true },
                legend: {
                  display: false,
                },
              }}
            />
          </Box>
        </div>
        {icon == null && this.renderLabels(dataSum, labels, data, title)}
      </div>
    );
  }
}

export const DoughnutChart = withStyles(styles)(withTheme(DoughnutChartRaw));
