/* eslint-disable sonarjs/no-identical-functions */
import * as React from 'react'
import PropTypes from 'prop-types'
import { toast } from 'react-toastify'
import { MuiTelInput } from 'mui-tel-input'
import 'yup-phone'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import {
  FormControl,
  Grid,
  MenuItem,
  Select,
  TextField,
  Typography,
  useMediaQuery,
  FormHelperText,
} from '@mui/material'
import { Controller, useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import amplitude from 'amplitude-js'
import ReactGA from 'react-ga'
import styled from '@emotion/styled'
import { useRouter } from 'next/router'
import * as api from '../../../services/employer.services'
import styles from './FormPopup.module.css'
import MyTypography from './MyTypography'
import LoadingButton from '../Button/LoadingButton'

const MuiTelComp = styled(MuiTelInput)`
  & .MuiInputBase-root {
    height: 47px;
    width: 100%;
  }

  & input {
    font-size: 14px;
  }
`
const PhoneGrid = styled(Grid)`
  & .MuiFormControl-root {
    width: 100%;
  }
`

const signupSchema = yup
  .object({
    name: yup.string().trim().required('Name is required'),
    email: yup
      .string()
      .trim()
      .email()
      .matches(
        /^[a-z0-9._%+-]+@(?!(gmail|yahoo|outlook|hotmail|icloud|test|live))[A-Za-z0-9.-]+\.[A-Za-z]{2,4}$/,
        'Please enter your work email',
      )
      .required('Email is required'),
    phone: yup.string().phone().required('Phone number is required'),
    companyName: yup.string().trim().required('Company Name is required'),
    talent: yup.string().trim().required('This field is required'),
  })
  .required()

const defaultValues = {
  name: '',
  email: '',
  companyName: '',
  talent: '',
  phone: '+20',
}

export default function FormPopup({ open, handleClose, location }) {
  const mobile = useMediaQuery((theme) => theme.breakpoints.down('sm'))
  const { pathname } = useRouter()
  const messagePosition = 'bottom-left'

  const { control, handleSubmit, reset } = useForm({
    defaultValues,
    resolver: yupResolver(signupSchema),
  })

  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const onSubmitHandler = async (signupData) => {
    setIsSubmitting(true)
    try {
      await api.employerSignUp(signupData)
      toast.success('Successfully signed up!', {
        position: messagePosition,
      })
      const eventProperties = {
        page: pathname,
        section: location,
      }
      if (process.env.NEXT_PUBLIC_ENV === 'production') {
        amplitude
          .getInstance()
          .logEvent('completedSignupPopup', eventProperties)
        ReactGA.event({
          category: 'employerLandingSignup',
          action: 'completedSignupPopup',
        })
      }
      handleClose()
      reset({ name: '', email: '', companyName: '', talent: '' })
    } catch (e) {
      if (e?.response && e.response?.data?.message) {
        toast.error(e?.response?.data?.message, {
          position: messagePosition,
        })
      } else {
        toast.error(e?.data?.message, {
          position: messagePosition,
        })
      }
    } finally {
      setIsSubmitting(false)
    }
  }
  return (
    <Dialog
      open={open}
      onClose={handleClose}
      aria-labelledby="alert-dialog-title"
      aria-describedby="alert-dialog-description"
      sx={{
        '& .MuiDialog-paper': {
          padding: '32px 24px',
          borderRadius: '8px',
          fontFamily: 'Poppins',
        },
      }}
    >
      <DialogTitle id="alert-dialog-title" sx={{ padding: '0 0 24px 0' }}>
        <Typography className={styles.form__title}>
          Tell us about yourself.
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ padding: '0 0 24px 0' }}>
        <Grid container direction="column" gap={3}>
          <Grid
            item
            container
            direction="row"
            gap="20px"
            wrap={mobile ? undefined : 'nowrap'}
            style={{ padding: '0' }}
          >
            <Grid
              container
              item
              xs={mobile ? 12 : 6}
              direction="column"
              gap="10px"
            >
              <Grid item>
                <MyTypography>Your Name</MyTypography>
              </Grid>
              <Grid item>
                <Controller
                  name="name"
                  control={control}
                  render={({
                    field: { onChange, value },
                    fieldState: { error },
                  }) => (
                    <TextField
                      fullWidth={mobile ? true : undefined}
                      sx={{
                        width: '100%',
                        '& .MuiOutlinedInput-notchedOutline': {
                          height: '52px',
                        },
                      }}
                      placeholder="ex:Khaled"
                      inputProps={{
                        style: {
                          fontSize: '14px',
                        },
                      }}
                      variant="outlined"
                      helperText={error ? error.message : null}
                      error={!!error}
                      onChange={onChange}
                      value={value}
                    />
                  )}
                />
              </Grid>
            </Grid>
            <Grid
              container
              item
              xs={mobile ? 12 : 6}
              direction="column"
              gap="10px"
            >
              <Grid item>
                <MyTypography>Your phone number</MyTypography>
              </Grid>
              <PhoneGrid item>
                <Controller
                  name="phone"
                  control={control}
                  render={({
                    field: { onChange, value },
                    fieldState: { error },
                  }) => (
                    <MuiTelComp
                      value={value}
                      onChange={onChange}
                      helperText={error ? error.message : null}
                      error={!!error}
                    />
                  )}
                />
              </PhoneGrid>
            </Grid>
          </Grid>
          <Grid
            item
            container
            gap="20px"
            wrap={mobile ? undefined : 'nowrap'}
            style={{ padding: '0' }}
          >
            <Grid
              item
              container
              direction="column"
              gap="10px"
              xs={mobile ? 12 : 6}
            >
              <Grid item>
                <MyTypography>Company Name</MyTypography>
              </Grid>
              <Grid item>
                <Controller
                  name="companyName"
                  control={control}
                  render={({
                    field: { onChange, value },
                    fieldState: { error },
                  }) => (
                    <TextField
                      fullWidth
                      sx={{
                        '& .MuiOutlinedInput-notchedOutline': {
                          height: '52px',
                        },
                      }}
                      placeholder="ex:Apple"
                      inputProps={{
                        style: {
                          fontSize: '14px',
                        },
                      }}
                      variant="outlined"
                      helperText={error ? error.message : null}
                      error={!!error}
                      onChange={onChange}
                      value={value}
                    />
                  )}
                />
              </Grid>
            </Grid>
            <Grid
              container
              item
              xs={mobile ? 12 : 6}
              direction="column"
              gap="10px"
            >
              <Grid item>
                <MyTypography>Your E-Mail</MyTypography>
              </Grid>
              <Grid item>
                <Controller
                  name="email"
                  control={control}
                  style={{ Width: '100% !important' }}
                  render={({
                    field: { onChange, value },
                    fieldState: { error },
                  }) => (
                    <TextField
                      fullWidth
                      sx={{
                        width: '100% !important',
                        '& .MuiOutlinedInput-notchedOutline': {
                          height: '52px',
                        },
                      }}
                      placeholder="ex:Khaled@lyrise.com"
                      inputProps={{
                        style: {
                          fontSize: '14px',
                          padding: '12px 12px',
                        },
                      }}
                      variant="outlined"
                      helperText={error ? error.message : null}
                      error={!!error}
                      onChange={onChange}
                      value={value}
                    />
                  )}
                />
              </Grid>
            </Grid>
          </Grid>
          <Grid item container direction="column" gap="10px">
            <Grid item>
              <MyTypography>Who are you looking to hire</MyTypography>
            </Grid>
            <Grid item>
              <Controller
                name="talent"
                control={control}
                render={({
                  field: { onChange, value },
                  fieldState: { error },
                }) => {
                  return (
                    <FormControl fullWidth>
                      <Select
                        value={value}
                        onChange={onChange}
                        error={!!error}
                        displayEmpty
                        sx={{
                          color: value === '' ? '#757575' : undefined,
                          fontSize: '14px',
                          '& .MuiOutlinedInput-notchedOutline': {
                            height: '52px',
                            padding: '0',
                          },
                          '& .MuiSelect-select': {
                            padding: '12px 12px',
                          },
                        }}
                      >
                        <MenuItem disabled selected value="">
                          ex:Data Science
                        </MenuItem>
                        <MenuItem value="Data Scientist">
                          Data Scientist
                        </MenuItem>
                        <MenuItem value="ML Engineer">ML Engineer</MenuItem>
                        <MenuItem value="NLP">NLP</MenuItem>
                        <MenuItem value="AI Engineer">AI Engineer</MenuItem>
                        <MenuItem value="Software Engineer">
                          Software Engineer
                        </MenuItem>
                        <MenuItem value="Computer Vision Engineer">
                          Computer Vision Engineer
                        </MenuItem>
                      </Select>
                      <FormHelperText sx={{ color: '#ff1744' }}>
                        {error ? error.message : null}
                      </FormHelperText>
                    </FormControl>
                  )
                }}
              />
            </Grid>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions
        sx={{
          padding: 0,
        }}
      >
        <Grid container direction="row" justifyContent="flex-end" gap={2}>
          <Grid item>
            <Button
              disableElevation
              variant="contained"
              sx={{
                width: '113px',
                height: '52px',
                border: '1px solid',
                borderRadius: '8px',
                boxShadow: '13px 21px 34px 2px rgba(66, 0, 255, 0.1)',
                borderColor: '#4200FF',
                textTransform: 'none',
                background: '#FFF',
                '&:hover': {
                  background: '#FFF',
                },
              }}
              onClick={handleClose}
            >
              <Typography className={styles.form__button} color="#1D4ED8">
                Cancel
              </Typography>
            </Button>
          </Grid>
          <Grid item>
            <LoadingButton
              as={Button}
              autoFocus
              disableElevation
              variant="contained"
              loading={isSubmitting}
              sx={{
                width: '113px',
                height: '52px',
                border: '1px solid',
                borderRadius: '8px',
                padding: '13px 24px',
                textTransform: 'none',
                background:
                  'linear-gradient(94.63deg, #094BF6 8.53%, #8282FF 107.57%)',
              }}
              onClick={handleSubmit(onSubmitHandler)}
            >
              <Typography className={styles.form__button}>Submit</Typography>
            </LoadingButton>
          </Grid>
        </Grid>
      </DialogActions>
    </Dialog>
  )
}

FormPopup.propTypes = {
  open: PropTypes.bool.isRequired,
  handleClose: PropTypes.func.isRequired,
  location: PropTypes.string.isRequired,
}
