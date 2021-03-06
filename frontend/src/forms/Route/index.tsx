import { Box, Button, Collapse, Grid, Link } from "@material-ui/core";
import { createStyles, Theme, withStyles, WithStyles } from "@material-ui/core/styles";
import Typography from "@material-ui/core/Typography";
import { Alert, AlertTitle } from "@material-ui/lab";
import { loadDomainDNSInfo } from "actions/domain";
import { KFreeSoloAutoCompleteMultipleSelectStringField } from "forms/Basic/autoComplete";
import { KBoolCheckboxRender, KCheckboxGroupRender } from "forms/Basic/checkbox";
import { KRadioGroupRender } from "forms/Basic/radio";
import { shouldError } from "forms/common";
import { ROUTE_FORM_ID } from "forms/formIDs";
import {
  KValidatorHostsWithWildcardPrefix,
  KValidatorPaths,
  ValidatorHttpRouteDestinations,
  ValidatorListNotEmpty,
  ValidatorRequired,
} from "forms/validator";
import routesGif from "images/routes.gif";
import Immutable from "immutable";
import React from "react";
import { connect } from "react-redux";
import { Link as RouteLink } from "react-router-dom";
import { RootState } from "reducers";
import { State as TutorialState } from "reducers/tutorial";
import { arrayPush, change, InjectedFormProps } from "redux-form";
import { Field, FieldArray, formValueSelector, getFormSyncErrors, reduxForm } from "redux-form/immutable";
import { formValidateOrNotBlockByTutorial } from "tutorials/utils";
import { TDispatchProp } from "types";
import {
  httpMethods,
  HttpRouteDestination,
  HttpRouteForm,
  methodsModeAll,
  methodsModeSpecific,
  newEmptyRouteForm,
} from "types/route";
import { isArray } from "util";
import { arraysMatch } from "utils";
import { includesForceHttpsDomain } from "utils/domain";
import { default as sc, default as stringConstants } from "utils/stringConstants";
import { CollapseWrapper } from "widgets/CollapseWrapper";
import DomainStatus from "widgets/DomainStatus";
import { AddIcon } from "widgets/Icon";
import { KPanel } from "widgets/KPanel";
import { Caption } from "widgets/Label";
import { Prompt } from "widgets/Prompt";
import { RenderHttpRouteConditions } from "./conditions";
import { RenderHttpRouteDestinations } from "./destinations";

const mapStateToProps = (state: RootState) => {
  const form = ROUTE_FORM_ID;
  const selector = formValueSelector(form || ROUTE_FORM_ID);
  const syncErrors = getFormSyncErrors(form || ROUTE_FORM_ID)(state) as { [key: string]: any };
  const certifications = state.get("certificates").get("certificates");
  const domains: Set<string> = new Set();
  const hosts = selector(state, "hosts") as Immutable.List<string>;
  const httpRedirectToHttps = !!selector(state, "httpRedirectToHttps") as boolean;

  certifications.forEach((x) => {
    x.get("domains")
      .filter((x) => x !== "*")
      .forEach((domain) => domains.add(domain));
  });

  return {
    tutorialState: state.get("tutorial"),
    syncErrors,
    schemes: selector(state, "schemes") as Immutable.List<string>,
    methodsMode: selector(state, "methodsMode") as string,
    hosts,
    httpRedirectToHttps,
    destinations: selector(state, "destinations") as Immutable.List<HttpRouteDestination>,
    domains: Array.from(domains),
    ingressIP: state.get("cluster").get("info").get("ingressIP"),
    certifications,
  };
};

const styles = (theme: Theme) =>
  createStyles({
    root: {
      "& .alert": {
        marginTop: theme.spacing(1),
        marginBottom: theme.spacing(1),
      },
    },
    box: {
      padding: theme.spacing(2),
      border: "1px solid black",
      marginBottom: theme.spacing(2),
    },

    heading: {
      fontSize: theme.typography.pxToRem(15),
      flexBasis: "20%",
      flexShrink: 0,
    },
    secondaryHeading: {
      fontSize: theme.typography.pxToRem(15),
      color: theme.palette.text.secondary,
    },
    secondaryTip: {
      color: theme.palette.text.secondary,
    },
  });

export interface TutorialStateProps {
  tutorialState: TutorialState;
}

interface OwnProps {
  isEdit?: boolean;
}

export interface ConnectedProps extends ReturnType<typeof mapStateToProps>, TDispatchProp {}

export interface Props
  extends InjectedFormProps<HttpRouteForm, TutorialStateProps>,
    ConnectedProps,
    OwnProps,
    WithStyles<typeof styles> {}

interface State {
  isAdvancedPartUnfolded: boolean;
  isValidCertificationUnfolded: boolean;
}

const hostsValidators = [ValidatorRequired, KValidatorHostsWithWildcardPrefix];
const pathsValidators = [ValidatorRequired, KValidatorPaths];

class RouteFormRaw extends React.PureComponent<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      isAdvancedPartUnfolded: false,
      isValidCertificationUnfolded: false,
    };
  }

  componentDidUpdate(prevProps: Props) {
    const { schemes, httpRedirectToHttps, hosts, dispatch, form } = this.props;
    if (!hosts.equals(prevProps.hosts)) {
      hosts.forEach((host) => {
        dispatch(loadDomainDNSInfo(host));
      });
    }

    // for dev, app domains auto enable https
    if (!schemes.includes("https")) {
      if (includesForceHttpsDomain(hosts).length > 0) {
        if (schemes.includes("http")) {
          dispatch(change(form, "schemes", Immutable.List(["http", "https"])));
        } else {
          dispatch(change(form, "schemes", Immutable.List(["https"])));
        }
      }
    }

    // set httpRedirectToHttps to false if http or https is not in schemes
    if (!(schemes.includes("http") && schemes.includes("https")) && httpRedirectToHttps) {
      dispatch(change(form, "httpRedirectToHttps", false));
    }
  }

  private canCertDomainsSuiteForHost = (domains: Immutable.List<string>, host: string) => {
    for (let i = 0; i < domains.size; i++) {
      const domain = domains.get(i)!;
      if (domain === "*") {
        return false;
      }

      if (domain.toLowerCase() === host.toLowerCase()) {
        return true;
      }

      const domainParts = domain.toLowerCase().split(".");
      const hostParts = host.toLowerCase().split(".");

      if (hostParts.length === 0 || domainParts.length === 0 || domainParts[0] !== "*") {
        continue;
      }

      if (arraysMatch(hostParts.slice(1), domainParts.slice(1))) {
        return true;
      }
    }

    return false;
  };

  private renderCertificationStatus() {
    const { hosts, certifications } = this.props;
    const { isValidCertificationUnfolded } = this.state;

    if (hosts.size === 0) {
      return null;
    }

    let hostCertResults: any[] = [];

    hosts.forEach((host) => {
      const cert = certifications.find((c) => this.canCertDomainsSuiteForHost(c.get("domains"), host));

      hostCertResults.push({
        host,
        cert,
      });
    });

    const missingCertsCount = hostCertResults.filter((x) => !x.cert).length;

    const missingCertsHosts = hostCertResults.filter((x) => !x.cert);
    const validHosts = hostCertResults.filter((x) => !!x.cert);

    return (
      <Alert severity={missingCertsCount === 0 ? "success" : "warning"}>
        {missingCertsHosts.length > 0 ? (
          <AlertTitle>
            {missingCertsHosts.length} host{missingCertsHosts.length > 1 ? "s are" : " is"} missing valid SSL
            certificate signed by a certificate authority.
          </AlertTitle>
        ) : (
          <AlertTitle>All hosts have valid SSL certifications signed by a certificate authority.</AlertTitle>
        )}

        {missingCertsHosts.length > 0 ? (
          <>
            <Box marginBottom={1}>
              {missingCertsHosts.map(({ host }) => {
                return (
                  <Box key={host} ml={2} fontWeight="bold">
                    {host}
                  </Box>
                );
              })}
            </Box>

            <Box marginBottom={1}>
              <Typography>
                Default tls certificate will be used for these domains. Invalid SSL certificate / Intermediate
                certificates error could occur when you try to access this route. Kalm provides a free & simple way to
                fix this issue in seconds.
                <RouteLink to="/certificates">Go to certification page</RouteLink>, and create a certificate for your
                domain.
              </Typography>
            </Box>
          </>
        ) : null}

        {validHosts.length > 0 ? (
          <Box mt={2} mb={1}>
            <Link
              component="button"
              variant="body2"
              onClick={() => this.setState({ isValidCertificationUnfolded: !isValidCertificationUnfolded })}
            >
              View hosts that have valid certificates.
            </Link>
          </Box>
        ) : null}
        <Collapse in={isValidCertificationUnfolded}>
          {validHosts.map(({ host, cert }) => {
            return (
              <Typography key={host}>
                <strong>{host}</strong> will use{" "}
                <Link href="#" variant="body2">
                  <strong>{cert.get("name")}</strong>
                </Link>{" "}
                certification.
              </Typography>
            );
          })}
        </Collapse>
      </Alert>
    );
  }

  private renderTargets = () => {
    const { dispatch, form, destinations } = this.props;
    if (destinations.size === 0) {
      dispatch(
        arrayPush(
          form,
          "destinations",
          Immutable.Map({
            host: "",
            weight: 1,
          }),
        ),
      );
    }
    return (
      <Box p={2}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={12} md={12}>
            <Box mt={2} mr={2} mb={2}>
              <Button
                variant="outlined"
                color="primary"
                startIcon={<AddIcon />}
                size="small"
                id="add-target-button"
                onClick={() =>
                  dispatch(
                    arrayPush(
                      form,
                      "destinations",
                      Immutable.Map({
                        host: "",
                        weight: 1,
                      }),
                    ),
                  )
                }
              >
                Add a target
              </Button>
            </Box>
            <Collapse in={destinations.size > 1}>
              <Alert className="alert" severity="info">
                There are more than one target, traffic will be forwarded to each target by weight.
              </Alert>
            </Collapse>
            <FieldArray
              name="destinations"
              component={RenderHttpRouteDestinations}
              rerenderOnEveryChange
              validate={ValidatorHttpRouteDestinations}
            />
          </Grid>
          <Grid item xs={8} sm={8} md={8}>
            <CollapseWrapper title={stringConstants.ROUTE_MULTIPLE_TARGETS_HELPER}>
              <Box m={2} style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}>
                <img src={routesGif} alt="routes with multi-target" width={233} height={133} />
                <Box pt={2}>
                  <Caption>{stringConstants.ROUTE_MULTIPLE_TARGETS_DESC}</Caption>
                </Box>
              </Box>
            </CollapseWrapper>
          </Grid>
        </Grid>
      </Box>
    );
  };
  public render() {
    const {
      methodsMode,
      classes,
      ingressIP,
      dispatch,
      form,
      schemes,
      handleSubmit,
      dirty,
      submitSucceeded,
      change,
      isEdit,
      hosts,
      syncErrors,
    } = this.props;

    const hstsDomains = includesForceHttpsDomain(hosts);

    const icons = hosts.map((host, index) => {
      if (isArray(syncErrors.hosts) && syncErrors.hosts[index]) {
        return undefined;
      } else {
        return <DomainStatus domain={host} />;
      }
    });
    return (
      <div className={classes.root}>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Prompt when={dirty && !submitSucceeded} message={sc.CONFIRM_LEAVE_WITHOUT_SAVING} />
            <Box mb={2}>
              <KPanel
                title="Hosts and paths"
                content={
                  <Box p={2}>
                    <KFreeSoloAutoCompleteMultipleSelectStringField
                      icons={icons}
                      label="Hosts"
                      name="hosts"
                      validate={hostsValidators}
                      placeholder="e.g. www.example.com"
                      helperText={
                        <Caption color="textSecondary">
                          Your cluster ip is{" "}
                          <Link
                            href="#"
                            onClick={() => {
                              const isHostsIncludeIngressIP = !!hosts.find((host) => host === ingressIP);
                              if (!isHostsIncludeIngressIP) {
                                change("hosts", hosts.push(ingressIP));
                              }
                            }}
                          >
                            {ingressIP}
                          </Link>
                          . {sc.ROUTE_HOSTS_INPUT_HELPER}
                        </Caption>
                      }
                    />
                    <KFreeSoloAutoCompleteMultipleSelectStringField
                      label="Path Prefixes"
                      name="paths"
                      validate={pathsValidators}
                      placeholder="e.g. /some/path/to/app"
                      helperText={sc.ROUTE_PATHS_INPUT_HELPER}
                    />
                    <Field
                      component={KBoolCheckboxRender}
                      name="stripPath"
                      label={sc.ROUTE_STRIP_PATH_LABEL}
                      helperText={sc.ROUTE_STRIP_PATH_HELPER}
                    />
                  </Box>
                }
              />
            </Box>

            <Box mb={2}>
              <KPanel
                title="Schemes and Methods"
                content={
                  <Box p={2}>
                    <Field
                      title="Http Methods"
                      component={KRadioGroupRender}
                      name="methodsMode"
                      options={[
                        {
                          value: methodsModeAll,
                          label: sc.ROUTE_HTTP_METHOD_ALL,
                        },
                        {
                          value: methodsModeSpecific,
                          label: sc.ROUTE_HTTP_METHOD_CUSTOM,
                        },
                      ]}
                    />
                    <Collapse in={methodsMode === methodsModeSpecific}>
                      <Field
                        component={KCheckboxGroupRender}
                        componentType={"Checkbox"}
                        validate={methodsMode === methodsModeSpecific ? ValidatorListNotEmpty : []}
                        name="methods"
                        options={httpMethods.map((m) => {
                          return { value: m, label: m };
                        })}
                      />
                    </Collapse>
                    <Field
                      title="Allow traffic through"
                      component={KCheckboxGroupRender}
                      componentType={"Checkbox"}
                      validate={ValidatorListNotEmpty}
                      name="schemes"
                      options={[
                        {
                          value: "http",
                          label: "http",
                        },
                        {
                          value: "https",
                          label: "https",
                          htmlColor: "#9CCC65",
                        },
                      ]}
                    />
                    <Collapse in={schemes.includes("http") && schemes.includes("https")}>
                      <Field
                        component={KBoolCheckboxRender}
                        name="httpRedirectToHttps"
                        label={
                          <span>
                            Redirect all <strong>http</strong> request to <strong>https</strong> with 301 status code.
                          </span>
                        }
                      />
                    </Collapse>
                    <Collapse in={schemes.includes("https")}>
                      <Alert className="alert" severity="info">
                        {sc.ROUTE_HTTPS_ALERT}
                      </Alert>
                      {hstsDomains.length > 0 ? (
                        <Alert className="alert" severity="warning">
                          <Box display="flex">
                            The
                            <Box ml="4px" mr="4px">
                              <strong>{hstsDomains.join(", ")}</strong>
                            </Box>
                            {stringConstants.HSTS_DOMAINS_REQUIRED_HTTPS}
                          </Box>
                        </Alert>
                      ) : null}
                      {this.renderCertificationStatus()}
                    </Collapse>
                  </Box>
                }
              />
            </Box>

            <Box mb={2}>
              <KPanel title="Targets" content={this.renderTargets()} />
            </Box>

            <Box mb={2}>
              <KPanel
                title="Rules"
                content={
                  <Box p={2}>
                    <Caption>
                      Set specific rules for this ingress. Only requests that match these conditions will be accepted.
                    </Caption>
                    <Box display="flex">
                      <Box mt={2} mr={2} mb={2}>
                        <Button
                          variant="outlined"
                          color="primary"
                          startIcon={<AddIcon />}
                          size="small"
                          onClick={() =>
                            dispatch(
                              arrayPush(
                                form,
                                "conditions",
                                Immutable.Map({
                                  type: "header",
                                  operator: "equal",
                                  name: "",
                                  value: "",
                                }),
                              ),
                            )
                          }
                        >
                          Add Header Rule
                        </Button>
                      </Box>
                      <Box mt={2} mr={2} mb={2}>
                        <Button
                          variant="outlined"
                          color="primary"
                          startIcon={<AddIcon />}
                          size="small"
                          onClick={() =>
                            dispatch(
                              arrayPush(
                                form,
                                "conditions",
                                Immutable.Map({
                                  type: "query",
                                  operator: "equal",
                                  name: "",
                                  value: "",
                                }),
                              ),
                            )
                          }
                        >
                          Add Query Rule
                        </Button>
                      </Box>
                    </Box>
                    <FieldArray name="conditions" component={RenderHttpRouteConditions} />
                  </Box>
                }
              />
            </Box>

            {/* <Expansion title="Advanced" subTitle="more powerful settings">
          <h1>TODO</h1>
          <div className={classes.box}>
            <FormControl component="fieldset">
              <FormLabel component="legend">High availability</FormLabel>
            </FormControl>
          </div>

          <div className={classes.box}>
            <FormControl component="fieldset">
              <FormLabel component="legend">Debug & Testing</FormLabel>
            </FormControl>
          </div>

          <div className={classes.box}>
            <FormControl component="fieldset">
              <FormLabel component="legend">CORS</FormLabel>
            </FormControl>
          </div>

          <div className={classes.box}>
            <FormControl component="fieldset">
              <FormLabel component="legend">Need more features?</FormLabel>
            </FormControl>
          </div>
        </Expansion> */}
            <Button
              id="add-route-submit-button"
              type="submit"
              onClick={handleSubmit}
              color="primary"
              variant="contained"
            >
              {isEdit ? "Update" : "Create"} Route
            </Button>
          </Grid>
        </Grid>
      </div>
    );
  }
}

// use connect twice
// The one inside reduxForm is normal usage
// The one outside of reduxForm is to set tutorialState props for the form

const form = reduxForm<HttpRouteForm, TutorialStateProps & OwnProps>({
  onSubmitFail: console.log,
  form: ROUTE_FORM_ID,
  enableReinitialize: true,
  initialValues: newEmptyRouteForm(),
  touchOnChange: true,
  shouldError: shouldError,
  validate: formValidateOrNotBlockByTutorial,
})(connect(mapStateToProps)(withStyles(styles)(RouteFormRaw)));

export const RouteForm = connect((state: RootState) => ({
  tutorialState: state.get("tutorial"),
}))(form);
