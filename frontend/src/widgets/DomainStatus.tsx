import React from "react";
import { connect } from "react-redux";
import { IconWithPopover } from "./IconWithPopover";
import { RootState } from "reducers";
import { TDispatchProp } from "types";
import { loadDomainDNSInfo } from "actions/domain";
import { CircularProgress, Box } from "@material-ui/core";
import { WarningIcon, CopyIcon, CheckCircleIcon } from "./Icon";
import { IconButtonWithTooltip } from "./IconButtonWithTooltip";
import copy from "copy-to-clipboard";
import { setSuccessNotificationAction } from "actions/notification";
import { regExpIp } from "forms/validator";

const mapStateToProps = (state: RootState, ownProps: OwnProps) => {
  const regResultIp = regExpIp.exec(ownProps.domain);
  return {
    domainStatus: state.get("domain").find((status) => status.get("domain") === ownProps.domain),
    ingressIP: state.get("cluster").get("info").get("ingressIP"),
    isIPDomain: regResultIp !== null,
  };
};

interface OwnProps {
  domain: string;
  cnameDomain?: string;
  ipAddress?: string;
  mr?: number;
}

interface Props extends ReturnType<typeof mapStateToProps>, TDispatchProp, OwnProps {}

class DomainStatus extends React.PureComponent<Props> {
  componentDidMount() {
    const { dispatch, domain, isIPDomain } = this.props;
    if (domain !== "*" && !isIPDomain) {
      dispatch(loadDomainDNSInfo(domain));
    }
  }

  componentDidUpdate(prevProps: Props) {
    const { dispatch, domain, isIPDomain } = this.props;
    if (domain !== prevProps.domain && domain !== "*" && !isIPDomain) {
      dispatch(loadDomainDNSInfo(domain));
    }
  }
  private getIPAddress = () => {
    const { ingressIP, ipAddress } = this.props;
    if (ipAddress != null) {
      return ipAddress;
    } else {
      return ingressIP;
    }
  };

  private getIPTipsText = () => {
    const { ingressIP, ipAddress } = this.props;
    if (ipAddress != null) {
      return (
        <>
          The IP address doesn’t match the IP address: <strong>{ipAddress}</strong>{" "}
        </>
      );
    } else {
      return (
        <>
          The IP address doesn’t match the Ingress IP address: <strong>{ingressIP}</strong>{" "}
        </>
      );
    }
  };

  private getHelperText = (cnameDomain: string | undefined, cnameRecords: string): React.ReactElement => {
    const helper =
      cnameDomain !== undefined ? (
        cnameRecords.length > 0 ? (
          <>
            <Box>
              current CNAME record is <strong>{cnameRecords}</strong>
            </Box>
            please add an CNAME record with your dns provider, point to <strong>{cnameDomain}</strong>{" "}
          </>
        ) : (
          <>
            please add an CNAME record with your dns provider, point to <strong>{cnameDomain}</strong>{" "}
          </>
        )
      ) : (
        <>
          please add an A record with your dns provider, point to <strong>{this.getIPAddress()}</strong>{" "}
        </>
      );
    return helper;
  };

  private getIconAndBody = () => {
    const { domainStatus, domain, dispatch, isIPDomain, cnameDomain } = this.props;
    const ip = this.getIPAddress();
    if (isIPDomain) {
      return {
        icon: domain === ip ? <CheckCircleIcon /> : <WarningIcon color="action" />,
        body:
          domain === ip ? (
            <Box p={2}>the domain is successfully configured!</Box>
          ) : (
            <Box p={2}>
              {this.getIPTipsText()}
              <IconButtonWithTooltip
                tooltipTitle="Copy"
                aria-label="copy"
                size="small"
                onClick={() => {
                  copy(ip);
                  dispatch(setSuccessNotificationAction("Copied successful!"));
                }}
              >
                <CopyIcon fontSize="small" />
              </IconButtonWithTooltip>
            </Box>
          ),
      };
    }
    if (!domainStatus || !domainStatus?.get("cname")) {
      return {
        icon: <CircularProgress size={24} style={{ padding: 2 }} />,
        body: <Box p={2}>checking domain status</Box>,
      };
    }

    const aRecords = domainStatus?.get("aRecords");
    let isError = (!aRecords || !aRecords.includes(ip)) && domain !== ip;
    const cnameRecords = domainStatus?.get("cname");
    if (isError && cnameDomain !== undefined) {
      isError = cnameDomain !== cnameRecords;
    }

    if (isError) {
      const copyContent = cnameRecords !== undefined ? cnameDomain! : ip;
      return {
        icon: <WarningIcon color="action" />,
        body: (
          <Box p={2}>
            {this.getHelperText(cnameDomain, cnameRecords)}
            <IconButtonWithTooltip
              tooltipTitle="Copy"
              aria-label="copy"
              size="small"
              onClick={(e) => {
                copy(copyContent);
                dispatch(setSuccessNotificationAction("Copied successful!"));
              }}
            >
              <CopyIcon fontSize="small" />
            </IconButtonWithTooltip>
          </Box>
        ),
      };
    } else {
      return {
        icon: <CheckCircleIcon />,
        body: <Box p={2}>the domain is successfully configured!</Box>,
      };
    }
  };

  render() {
    const { domain, mr } = this.props;
    if (domain === "*") {
      return null;
    }
    const { icon, body } = this.getIconAndBody();
    return <IconWithPopover icon={icon} popoverBody={body} popupId={`${domain}-popover`} mr={mr} />;
  }
}

export default connect(mapStateToProps)(DomainStatus);
